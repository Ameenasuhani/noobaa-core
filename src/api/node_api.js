/**
 *
 * NODE API
 *
 * most are client (currently web client) talking to the web server
 * to work on node usually as admin.
 *
 * the heartbeat is sent from an agent to the web server
 *
 */
'use strict';

module.exports = {

    id: 'node_api',

    methods: {

        heartbeat: {
            // do not define/require more fields!
            // read this explanation -
            // the heartbeat request/reply should not require or verify any fields
            // since on upgrades the agents are still running old version
            // and the heartbeat is the one that should let them know they
            // should pull the new version, so it should not fail on missing/extra fields.
            method: 'PUT',
            params: {
                $ref: '#/definitions/heartbeat_schema_for_upgrade_compatibility'
            },
            reply: {
                $ref: '#/definitions/heartbeat_schema_for_upgrade_compatibility'
            },
            auth: {
                system: false
            }
        },

        list_nodes: {
            method: 'GET',
            params: {
                type: 'object',
                // required: [],
                properties: {
                    query: {
                        type: 'object',
                        // required: [],
                        properties: {
                            pools: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                },
                            },
                            name: {
                                // regexp
                                type: 'string'
                            },
                            geolocation: {
                                // regexp
                                type: 'string'
                            },
                            online: {
                                type: 'boolean',
                            },
                            readable: {
                                type: 'boolean',
                            },
                            writable: {
                                type: 'boolean',
                            },
                            trusted: {
                                type: 'boolean',
                            },
                            migrating_to_pool: {
                                type: 'boolean'
                            },
                            decommissioning: {
                                type: 'boolean',
                            },
                            decommissioned: {
                                type: 'boolean',
                            },
                            disabled: {
                                type: 'boolean',
                            },
                        }
                    },
                    skip: {
                        type: 'integer'
                    },
                    limit: {
                        type: 'integer'
                    },
                    pagination: {
                        type: 'boolean'
                    },
                    sort: {
                        type: 'string',
                        enum: ['name', 'ip', 'online']
                    },
                    order: {
                        type: 'integer',
                    }

                }
            },
            reply: {
                type: 'object',
                required: ['nodes'],
                properties: {
                    total_count: {
                        type: 'integer'
                    },
                    nodes: {
                        type: 'array',
                        items: {
                            $ref: '#/definitions/node_full_info'
                        }
                    }
                }
            },
            auth: {
                system: 'admin'
            }
        },

        read_node: {
            method: 'GET',
            params: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: {
                        type: 'string'
                    }
                }
            },
            reply: {
                $ref: '#/definitions/node_full_info'
            },
            auth: {
                system: 'admin'
            }
        },

        delete_node: {
            method: 'DELETE',
            params: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: {
                        type: 'string',
                    },
                }
            },
            auth: {
                system: 'admin'
            }
        },

        n2n_signal: {
            method: 'POST',
            params: {
                $ref: '#/definitions/signal_params'
            },
            reply: {
                $ref: '#/definitions/signal_reply'
            },
            auth: {
                system: false
            }
        },

        n2n_proxy: {
            method: 'POST',
            params: {
                $ref: 'common_api#/definitions/proxy_params'
            },
            reply: {
                $ref: 'common_api#/definitions/proxy_reply'
            },
            auth: {
                system: false
            }
        },

        test_node_network: {
            method: 'POST',
            params: {
                $ref: 'agent_api#/definitions/self_test_params'
            },
            reply: {
                $ref: 'agent_api#/definitions/self_test_reply'
            },
            auth: {
                system: ['admin']
            }
        },

        collect_agent_diagnostics: {
            method: 'GET',
            params: {
                //type: 'object',
                $ref: '#/definitions/node_full_info',
                /*required: ['target'],
                properties: {
                    target: {
                        type: 'string'
                    }
                },*/
            },
            reply: {
                type: 'string',
            },
            auth: {
                system: 'admin',
            }
        },

        set_debug_node: {
            method: 'POST',
            params: {
                type: 'object',
                required: ['target', 'level'],
                properties: {
                    target: {
                        type: 'string',
                    },
                    level: {
                        type: 'integer',
                    }
                },
            },
            auth: {
                system: 'admin',
            }
        },

        ping: {
            method: 'POST',
            auth: {
                system: ['admin', 'agent', 'create_node']
            }
        },

        get_test_nodes: {
            method: 'GET',
            params: {
                type: 'object',
                required: ['count', 'source'],
                properties: {
                    count: {
                        type: 'integer',
                    },
                    source: {
                        type: 'string',
                    },
                }
            },
            reply: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['name', 'rpc_address'],
                    properties: {
                        name: {
                            type: 'string'
                        },
                        rpc_address: {
                            type: 'string'
                        }
                    }
                }
            },
            auth: {
                system: 'admin',
            }
        },

        report_node_block_error: {
            method: 'POST',
            params: {
                type: 'object',
                required: [
                    'action',
                    'block_md'
                ],
                properties: {
                    action: {
                        type: 'string',
                        enum: ['write', 'read'],
                    },
                    block_md: {
                        $ref: 'common_api#/definitions/block_md'
                    },
                },
            },
            auth: {
                system: ['admin', 'user', 'agent']
            }
        },

    },


    definitions: {

        node_full_info: {
            type: 'object',
            required: [
                'id',
                'name',
                'pool',
                'rpc_address',
                'peer_id',
                'ip',
                'online',
                'heartbeat',
                'version',
                'storage',
            ],
            properties: {
                id: {
                    type: 'string'
                },
                name: {
                    type: 'string'
                },
                pool: {
                    type: 'string'
                },
                geolocation: {
                    type: 'string'
                },
                rpc_address: {
                    type: 'string'
                },
                base_address: {
                    type: 'string'
                },
                peer_id: {
                    type: 'string'
                },
                ip: {
                    type: 'string'
                },
                version: {
                    type: 'string'
                },
                heartbeat: {
                    format: 'idate'
                },
                online: {
                    type: 'boolean',
                },
                readable: {
                    type: 'boolean',
                },
                writable: {
                    type: 'boolean',
                },
                untrusted: {
                    type: 'boolean',
                },
                migrating_to_pool: {
                    type: 'boolean'
                },
                decommissioning: {
                    type: 'boolean',
                },
                decommissioned: {
                    type: 'boolean',
                },
                disabled: {
                    type: 'boolean',
                },
                rebuilding: {
                    type: 'object',
                    properties: {
                        completed_size: {
                            type: 'number',
                        },
                        remaining_size: {
                            type: 'number',
                        },
                        start_time: {
                            format: 'idate'
                        },
                        remaining_time: {
                            format: 'idate'
                        },
                    }
                },
                storage: {
                    $ref: 'common_api#/definitions/storage_info'
                },
                drives: {
                    type: 'array',
                    items: {
                        $ref: 'common_api#/definitions/drive_info'
                    }
                },
                os_info: {
                    $ref: 'common_api#/definitions/os_info'
                },
                latency_to_server: {
                    $ref: '#/definitions/latency_array'
                },
                latency_of_disk_write: {
                    $ref: '#/definitions/latency_array'
                },
                latency_of_disk_read: {
                    $ref: '#/definitions/latency_array'
                },
                debug_level: {
                    type: 'integer',
                }
            }
        },

        signal_params: {
            type: 'object',
            required: ['target'],
            additionalProperties: true,
            properties: {
                target: {
                    type: 'string'
                },
                //Passing params to the actual API done via
                //request_params: {
                //}
            },
        },

        signal_reply: {
            type: 'object',
            additionalProperties: true,
            properties: {}
        },

        latency_array: {
            type: 'array',
            items: {
                type: 'number',
            }
        },

        heartbeat_schema_for_upgrade_compatibility: {
            type: 'object',
            additionalProperties: true,
            properties: {
                // the only field we use now is version.
                // however since we want to avoid any kind of upgrade
                // compatibility issues in the future, we leave this schema
                // completely open, so that both the upgraded server and the
                // under-graded agent will not reject each others request/reply
                // version: {type:'string'}
            }
        }

    }

};
