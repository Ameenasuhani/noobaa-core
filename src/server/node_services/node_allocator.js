'use strict';

const _ = require('lodash');
const chance = require('chance')();

const P = require('../../util/promise');
const dbg = require('../../util/debug_module')(__filename);
const config = require('../../../config.js');
const nodes_client = require('./nodes_client');

const ALLOC_REFRESH_MS = 10000;

const alloc_group_by_pool = {};
const alloc_group_by_pool_set = {};


function refresh_tiering_alloc(tiering) {
    let pools = _.flatten(_.map(tiering.tiers,
        tier_and_order => tier_and_order.tier.pools));
    return P.map(pools, refresh_pool_alloc);
}

function refresh_pool_alloc(pool) {
    var group =
        alloc_group_by_pool[pool._id] =
        alloc_group_by_pool[pool._id] || {
            last_refresh: 0,
            nodes: [],
        };

    dbg.log1('refresh_pool_alloc: checking pool', pool._id, 'group', group);

    // cache the nodes for some time before refreshing
    if (Date.now() < group.last_refresh + ALLOC_REFRESH_MS) {
        return P.resolve();
    }

    if (group.promise) return group.promise;

    group.promise = P.resolve()
        .then(() => nodes_client.instance().allocate_nodes(pool.system._id, pool._id))
        .then(res => {
            group.last_refresh = Date.now();
            group.promise = null;
            group.nodes = res.nodes;
            dbg.log0('refresh_pool_alloc: updated pool', pool._id,
                'nodes', _.map(group.nodes, 'name'));
            _.each(alloc_group_by_pool_set, (g, pool_set) => {
                if (_.includes(pool_set, String(pool._id))) {
                    dbg.log0('invalidate alloc_group_by_pool_set for', pool_set,
                        'on change to pool', pool._id);
                    delete alloc_group_by_pool_set[pool_set];
                }
            });
        }, err => {
            group.promise = null;
            throw err;
        });

    return group.promise;
}

/**
 *
 * allocate_node
 *
 * @param avoid_nodes array of node ids to avoid
 * @param content_tiering_params - in case of content tiering, the additional
 * replicas will be saved in nodes that have the best disk read latency, but only
 * from the chunk of nodes that we've received in pools.
 *
 */
function allocate_node(pools, avoid_nodes, content_tiering_params) {
    let pool_set = _.map(pools, pool => String(pool._id)).sort().join(',');
    let alloc_group =
        alloc_group_by_pool_set[pool_set] =
        alloc_group_by_pool_set[pool_set] || {
            nodes: chance.shuffle(_.flatten(_.map(pools, pool => {
                let group = alloc_group_by_pool[pool._id];
                return group && group.nodes;
            })))
        };

    // If we are allocating a node for content tiering special replicas,
    // we should run an additional sort, in order to get the best read latency nodes
    if (content_tiering_params && content_tiering_params.special_replica) {
        alloc_group.nodes = _.sortBy(alloc_group.nodes, node =>
            // In order to sort the nodes by the best read latency values.
            // We need to get the average of all the latency disk read values,
            // and sort the nodes by the average that we've calculated.
            _.sum(node.latency_of_disk_read) / node.latency_of_disk_read.length
        );
    }

    let num_nodes = alloc_group ? alloc_group.nodes.length : 0;
    dbg.log1('allocate_node: pool_set', pool_set,
        'num_nodes', num_nodes,
        'alloc_group', alloc_group);
    if (pools[0].cloud_pool_info) {
        if (num_nodes !== config.NODES_PER_CLOUD_POOL) {
            throw new Error('allocate_node: cloud_pool allocations should have only one node (cloud node)');
        }
    } else if (num_nodes < config.NODES_MIN_COUNT) {
        throw new Error('allocate_node: not enough online nodes in pool set ' +
            pool_set + ' num_nodes ' + num_nodes);
    }

    // allocate first tries from nodes with no error,
    // but if non can be found then it will try to allocate from nodes with error.
    // this allows pools with small number of nodes to overcome transient errors
    // without failing to allocate.
    // nodes with error that are indeed offline they will eventually
    // be filtered by refresh_pool_alloc.
    return allocate_from_list(alloc_group.nodes, avoid_nodes, false) ||
        allocate_from_list(alloc_group.nodes, avoid_nodes, true);
}

function allocate_from_list(nodes, avoid_nodes, use_nodes_with_errors) {
    for (var i = 0; i < nodes.length; ++i) {
        var node = get_round_robin(nodes);
        if (Boolean(use_nodes_with_errors) ===
            Boolean(node.report_error_on_node_alloc) &&
            !_.includes(avoid_nodes, String(node._id))) {
            dbg.log1('allocate_node: allocated node', node.name,
                'avoid_nodes', avoid_nodes);
            return node;
        }
    }
}

function get_round_robin(nodes) {
    var rr = (nodes.rr || 0) % nodes.length;
    nodes.rr = rr + 1;
    return nodes[rr];
}

/**
 * find the node in the memory groups and mark the error time
 */
function report_error_on_node_alloc(node_id) {
    _.each(alloc_group_by_pool, (group, pool_id) => {
        _.each(group.nodes, node => {
            if (String(node._id) === String(node_id)) {
                node.report_error_on_node_alloc = new Date();
            }
        });
    });
}


// EXPORTS
exports.refresh_tiering_alloc = refresh_tiering_alloc;
exports.refresh_pool_alloc = refresh_pool_alloc;
exports.allocate_node = allocate_node;
exports.report_error_on_node_alloc = report_error_on_node_alloc;
