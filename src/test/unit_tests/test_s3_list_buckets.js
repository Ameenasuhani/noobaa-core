/* Copyright (C) 2016 NooBaa */
/* eslint-disable max-lines-per-function */
/* eslint-disable no-invalid-this */

'use strict';
// setup coretest first to prepare the env
const coretest = require('./coretest');
coretest.setup({ pools_to_create: coretest.POOL_LIST });
const config = require('../../../config');
const { S3Client, ListBucketsCommand, CreateBucketCommand, DeleteBucketCommand } = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@smithy/node-http-handler");
const http_utils = require('../../util/http_utils');
const mocha = require('mocha');
const assert = require('assert');

const { rpc_client, EMAIL } = coretest;

const bucket_names = ['a.bucket1',
                        'b.bucket2',
                        'f.bucket3',
                        'c.bucket4',
                        'h.bucket5',
                        'd.bucket6',
                        'e.bucket7',
                        'g.bucket8'
                    ];

mocha.describe('s3_ops', function() {

    let s3;
    let s3_client_params;

    mocha.before(async function() {
        const self = this;
        self.timeout(60000);
        const account_info = await rpc_client.account.read_account({ email: EMAIL, });
        s3_client_params = {
            endpoint: coretest.get_http_address(),
            credentials: {
                accessKeyId: account_info.access_keys[0].access_key.unwrap(),
                secretAccessKey: account_info.access_keys[0].secret_key.unwrap(),
            },
            forcePathStyle: true,
            region: config.DEFAULT_REGION,
            requestHandler: new NodeHttpHandler({
                httpAgent: http_utils.get_unsecured_agent(coretest.get_http_address()),
            }),
        };
        s3 = new S3Client(s3_client_params);
        coretest.log('S3 CONFIG', s3.config);
    });

    mocha.after(async () => {
        let delete_bucket;
        for (const bucket of bucket_names) {
                delete_bucket = new DeleteBucketCommand({
                Bucket: bucket,
            });
            await s3.send(delete_bucket);
        }
    });

    mocha.describe('list paginated bucket op', function() {
        this.timeout(60000);
        let res;
        let create_bucket;
        mocha.it('Create 8 buckets', async function() {
            for (const bucket of bucket_names) {
                create_bucket = new CreateBucketCommand({
                    Bucket: bucket,
                });
                await s3.send(create_bucket);
            }
        });

        mocha.it('Delete first.bucket', async function() {
                const delete_bucket = new DeleteBucketCommand({
                    Bucket: "first.bucket",
                });
                await s3.send(delete_bucket);
        });

        mocha.it('List Buckets with pagination: MaxBuckets < Number of Buckets', async function() {
            let input = {
                MaxBuckets: 3
            };
            let command = new ListBucketsCommand(input);
            res = await s3.send(command);
            assert(res.Buckets.length === 3);
            assert(res.ContinuationToken !== undefined);

            input = {
                MaxBuckets: 3,
                ContinuationToken: res.ContinuationToken
            };
            command = new ListBucketsCommand(input);
            res = await s3.send(command);
            assert(res.Buckets.length === 3);
            assert(res.ContinuationToken !== undefined);

            input = {
                MaxBuckets: 3,
                ContinuationToken: res.ContinuationToken
            };
            command = new ListBucketsCommand(input);
            res = await s3.send(command);
            assert(res.Buckets.length === 2);
            assert(res.ContinuationToken === undefined);

        });

        mocha.it('List Buckets with pagination: MaxBuckets > Number of Buckets', async function() {
            const input = {
                MaxBuckets: 20
            };
            const command = new ListBucketsCommand(input);
            res = await s3.send(command);
            assert(res.Buckets.length === 8);
            assert(res.ContinuationToken === undefined);

        });

        mocha.it('List Buckets without pagination', async function() {
            const command = new ListBucketsCommand();
            res = await s3.send(command);
            assert(res.Buckets.length === 8);
        });
    });

});

