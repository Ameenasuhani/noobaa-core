/* Copyright (C) 2016 NooBaa */
'use strict';

const _ = require('lodash');
const util = require('util');
const argv = require('minimist')(process.argv);
const http_utils = require('../../util/http_utils');

const dotenv = require('../../util/dotenv');
dotenv.load();

const P = require('../../util/promise');
const api = require('../../api');
const os_utils = require('../../util/os_utils');
const basic_server_ops = require('../utils/basic_server_ops');

const SERVICES_WAIT_IN_SECONDS = 30;
//This was implemented to work on local servers only
// The reason is that there is no component to control the services remotely
// If there will be a component in the future just change the method control_services
argv.ip = argv.ip || 'localhost';
argv.access_key = argv.access_key || '123';
argv.secret_key = argv.secret_key || 'abc';
const rpc = api.new_rpc();
const client = rpc.new_client({
    address: 'ws://' + argv.ip + ':' + process.env.PORT
});


// Does the Auth and returns the nodes in the system
function create_auth() {
    const auth_params = {
        email: 'demo@noobaa.com',
        password: 'DeMo1',
        system: 'demo'
    };
    return P.fcall(function() {
            return client.create_auth_token(auth_params);
        })
        .then(() => {
            // do nothing. 
        });
}

// Services is an array of strings for each service or ['all']
// Command: stop, start, restart
function control_services(command, services) {
    return os_utils.exec(`supervisorctl ${command} ${(services || []).join(' ')}`, {
            ignore_rc: false,
            return_stdout: true
        })
        .then(res => {
            console.log('control_services response:', res);
        })
        .catch(err => {
            console.error('control_services had an error:', err);
            throw err;
        });
}

// Does the Auth and returns the nodes in the system
async function create_bucket(bucket_name) {
    await client.tier.create_tier({
        name: `${bucket_name}tier`,
        attached_pools: ['first-pool'],
        data_placement: 'SPREAD'
    });
    await client.tiering_policy.create_policy({
        name: `${bucket_name}tiering`,
        tiers: [{
            order: 0,
            tier: `${bucket_name}tier`,
            spillover: false,
            disabled: false
        }]
    });
    return await client.bucket.create_bucket({
        name: bucket_name,
        tiering: `${bucket_name}tiering`,
    });
}

async function upload_file_to_bucket(bucket_name) {
    const file_key = await basic_server_ops.generate_random_file(1);
    await basic_server_ops.upload_file(argv.ip, file_key, bucket_name, file_key);
    return file_key;
}

async function prepare_buckets_with_objects() {
    const CYCLES_TO_TEST = 2;
    const buckets_used = [];

    for (let cycle = 0; cycle < CYCLES_TO_TEST; ++cycle) {
        const cycle_bucket_name = `slothaggregator${cycle}`;
        //TODO:: used to update system time by milli cycke_jump * FIVE_MINUTES_IN_MILLI
        await create_bucket(cycle_bucket_name);
        const current_fkey = await upload_file_to_bucket(cycle_bucket_name);
        await Promise.all(buckets_used.map(async bucket_obj => {
            const fkey = await upload_file_to_bucket(bucket_obj.bucket_name);
            const bucket_f = buckets_used.find(
                b => String(b.bucket_name) === String(bucket_obj.bucket_name)
            );
            bucket_f.file_names.push(fkey);
        }));
        buckets_used.push({
            bucket_name: cycle_bucket_name,
            file_names: [current_fkey]
        });
    }
    await control_services('restart', ['all']);
    await wait_for_s3_and_web(SERVICES_WAIT_IN_SECONDS);
    return buckets_used;
}

function calculate_expected_storage_stats_for_buckets(buckets_array, storage_read_by_bucket) {
    console.log('calculate_expected_storage_stats_for_buckets started');
    return P.map_one_by_one(buckets_array, bucket => {
        const current_bucket_storage = {
            chunks_capacity: 0,
            objects_size: 0,
            blocks_size: 0
        };

        return P.map_one_by_one(bucket.file_names, function(file_name) {
                return client.object.read_object_mapping_admin({
                        bucket: bucket.bucket_name,
                        key: file_name,
                    })
                    .then(res => {
                        _.forEach(res.chunks, chunk => _.forEach(chunk.frags, frag => _.forEach(frag.blocks, block => {
                            current_bucket_storage.blocks_size += block.block_md.size;
                        })));
                        current_bucket_storage.objects_size += res.object_md.size;
                        current_bucket_storage.chunks_capacity +=
                            _.sum(_.map(res.chunks, chunk => chunk.compress_size || 0));
                    });
            })
            .then(() => {
                if ((current_bucket_storage.chunks_capacity !==
                        storage_read_by_bucket[bucket.bucket_name].chunks_capacity) ||
                    (current_bucket_storage.objects_size !==
                        storage_read_by_bucket[bucket.bucket_name].objects_size) ||
                    (current_bucket_storage.blocks_size !==
                        storage_read_by_bucket[bucket.bucket_name].blocks_size)
                ) {
                    console.error(`${bucket.bucket_name}: calculated - ${util.inspect(current_bucket_storage, false, null, true)}
                        expected - ${util.inspect(storage_read_by_bucket[bucket.bucket_name], false, null, true)}`);
                    throw new Error(`Failed for bucket ${bucket.bucket_name}`);
                }
            });
    });
}

function run_test() {
    let test_buckets;
    return control_services('stop', ['bg_workers'])
        .then(() => create_auth())
        .then(() => prepare_buckets_with_objects())
        .then(buckets => {
            console.log('Waiting for calculations', buckets);
            test_buckets = buckets;
        })
        .then(() => P.delay(5 * 60 * 1000))
        .then(() => client.system.read_system({}))
        .then(sys_res => {
            const storage_by_bucket = {};

            sys_res.buckets.forEach(bucket => {
                if (String(bucket.name.unwrap()) !== 'first.bucket') {
                    storage_by_bucket[bucket.name.unwrap()] = {
                        //Should include objects count, maybe histogram also
                        chunks_capacity: bucket.data.size_reduced,
                        objects_size: bucket.data.size,
                        blocks_size: bucket.storage.values.used
                    };
                }
            });

            return calculate_expected_storage_stats_for_buckets(
                test_buckets,
                storage_by_bucket
            );
        });
}

function main() {
    return run_test()
        .then(function() {
            console.log('TEST PASSED! Everything Seems To Be Fine...');
            rpc.disconnect_all();
            process.exit(0);
        })
        .catch(function(err) {
            console.error('TEST FAILED: ', err.stack || err);
            rpc.disconnect_all();
            process.exit(1);
        });
}

if (require.main === module) {
    main();
}

// S3 and WEB are the only ones that we check
// Ideally we should check mongodb and bg as well
function wait_for_s3_and_web(max_seconds_to_wait) {
    return P.all([
            wait_for_server_to_start(max_seconds_to_wait, String(process.env.ENDPOINT_PORT || 80)),
            wait_for_server_to_start(max_seconds_to_wait, String(process.env.PORT) || 8080),
            wait_for_mongodb_to_start(max_seconds_to_wait)
        ])
        .then(() => {
            // do nothing. 
        });
}

async function wait_for_mongodb_to_start(max_seconds_to_wait) {
    let is_not_listening = true;
    const MAX_RETRIES = max_seconds_to_wait;
    let wait_counter = 1;
    //wait up to 10 seconds
    console.log('waiting for mongodb to start (1)');

    while (is_not_listening) {
        try {
            const res = await os_utils.exec('supervisorctl status mongo_wrapper', {
                ignore_rc: false,
                return_stdout: true
            });
            if (String(res).indexOf('RUNNING') > -1) {
                console.log('mongodb started after ' + wait_counter + ' seconds');
                is_not_listening = false;
            } else {
                throw new Error('Still waiting');
            }

        } catch (err) {
            console.log('waiting for mongodb to start(2)');
            wait_counter += 1;
            if (wait_counter >= MAX_RETRIES) {
                console.error('Too many retries after restart mongodb', err);
                throw new Error('Too many retries');
            }
            await P.delay(1000);
        }
    }
}

async function wait_for_server_to_start(max_seconds_to_wait, port) {
    let is_not_listening = true;
    const MAX_RETRIES = max_seconds_to_wait;
    let wait_counter = 1;
    //wait up to 10 seconds
    console.log('waiting for server to start (1)');

    while (is_not_listening) {
        try {
            await http_utils.http_get('http://localhost:' + port);
            console.log('server started after ' + wait_counter + ' seconds');
            is_not_listening = false;

        } catch (err) {
            console.log('waiting for server to start(2)');
            wait_counter += 1;
            if (wait_counter >= MAX_RETRIES) {
                console.error('Too many retries after restart server', err);
                throw new Error('Too many retries');
            }
            await P.delay(1000);
        }
    }
}

exports.run_test = run_test;
