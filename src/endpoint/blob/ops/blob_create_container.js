/* Copyright (C) 2016 NooBaa */
'use strict';

function create_container(req, res) {
    return req.rpc_client.bucket.create_bucket({
            name: req.params.bucket
        })
        .then(() => {
            res.statusCode = 201;
        });
}

module.exports = {
    handler: create_container,
    body: {
        type: 'empty',
    },
    reply: {
        type: 'empty',
    },
};