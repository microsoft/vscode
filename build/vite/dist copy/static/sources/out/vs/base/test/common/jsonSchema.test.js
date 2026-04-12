/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getCompressedContent } from '../../common/jsonSchema.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('JSON Schema', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('getCompressedContent 1', () => {
        const schema = {
            type: 'object',
            properties: {
                a: {
                    type: 'object',
                    description: 'a',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    type: 'object',
                                    properties: {
                                        d: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                e: {
                    type: 'object',
                    description: 'e',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    type: 'object',
                                    properties: {
                                        d: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const expected = {
            type: 'object',
            properties: {
                a: {
                    type: 'object',
                    description: 'a',
                    properties: {
                        b: {
                            $ref: '#/$defs/_0'
                        }
                    }
                },
                e: {
                    type: 'object',
                    description: 'e',
                    properties: {
                        b: {
                            $ref: '#/$defs/_0'
                        }
                    }
                }
            },
            $defs: {
                '_0': {
                    type: 'object',
                    properties: {
                        c: {
                            type: 'object',
                            properties: {
                                d: {
                                    type: 'string'
                                }
                            }
                        }
                    }
                }
            }
        };
        assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
    });
    test('getCompressedContent 2', () => {
        const schema = {
            type: 'object',
            properties: {
                a: {
                    type: 'object',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    type: 'object',
                                    properties: {
                                        d: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                e: {
                    type: 'object',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    type: 'object',
                                    properties: {
                                        d: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const expected = {
            type: 'object',
            properties: {
                a: {
                    $ref: '#/$defs/_0'
                },
                e: {
                    $ref: '#/$defs/_0'
                }
            },
            $defs: {
                '_0': {
                    type: 'object',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    type: 'object',
                                    properties: {
                                        d: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
    });
    test('getCompressedContent 3', () => {
        const schema = {
            type: 'object',
            properties: {
                a: {
                    type: 'object',
                    oneOf: [
                        {
                            allOf: [
                                {
                                    properties: {
                                        name: {
                                            type: 'string'
                                        },
                                        description: {
                                            type: 'string'
                                        }
                                    }
                                },
                                {
                                    properties: {
                                        street: {
                                            type: 'string'
                                        },
                                    }
                                }
                            ]
                        },
                        {
                            allOf: [
                                {
                                    properties: {
                                        name: {
                                            type: 'string'
                                        },
                                        description: {
                                            type: 'string'
                                        }
                                    }
                                },
                                {
                                    properties: {
                                        river: {
                                            type: 'string'
                                        },
                                    }
                                }
                            ]
                        },
                        {
                            allOf: [
                                {
                                    properties: {
                                        name: {
                                            type: 'string'
                                        },
                                        description: {
                                            type: 'string'
                                        }
                                    }
                                },
                                {
                                    properties: {
                                        mountain: {
                                            type: 'string'
                                        },
                                    }
                                }
                            ]
                        }
                    ]
                },
                b: {
                    type: 'object',
                    properties: {
                        street: {
                            properties: {
                                street: {
                                    type: 'string'
                                }
                            }
                        }
                    }
                }
            }
        };
        const expected = {
            'type': 'object',
            'properties': {
                'a': {
                    'type': 'object',
                    'oneOf': [
                        {
                            'allOf': [
                                {
                                    '$ref': '#/$defs/_0'
                                },
                                {
                                    '$ref': '#/$defs/_1'
                                }
                            ]
                        },
                        {
                            'allOf': [
                                {
                                    '$ref': '#/$defs/_0'
                                },
                                {
                                    'properties': {
                                        'river': {
                                            'type': 'string'
                                        }
                                    }
                                }
                            ]
                        },
                        {
                            'allOf': [
                                {
                                    '$ref': '#/$defs/_0'
                                },
                                {
                                    'properties': {
                                        'mountain': {
                                            'type': 'string'
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                },
                'b': {
                    'type': 'object',
                    'properties': {
                        'street': {
                            '$ref': '#/$defs/_1'
                        }
                    }
                }
            },
            '$defs': {
                '_0': {
                    'properties': {
                        'name': {
                            'type': 'string'
                        },
                        'description': {
                            'type': 'string'
                        }
                    }
                },
                '_1': {
                    'properties': {
                        'street': {
                            'type': 'string'
                        }
                    }
                }
            }
        };
        const actual = getCompressedContent(schema);
        assert.deepEqual(actual, JSON.stringify(expected));
    });
    test('getCompressedContent 4', () => {
        const schema = {
            type: 'object',
            properties: {
                a: {
                    type: 'object',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    type: 'object',
                                    properties: {
                                        d: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                e: {
                    type: 'object',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    type: 'object',
                                    properties: {
                                        d: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                f: {
                    type: 'object',
                    properties: {
                        d: {
                            type: 'string'
                        }
                    }
                }
            }
        };
        const expected = {
            type: 'object',
            properties: {
                a: {
                    $ref: '#/$defs/_0'
                },
                e: {
                    $ref: '#/$defs/_0'
                },
                f: {
                    $ref: '#/$defs/_1'
                }
            },
            $defs: {
                '_0': {
                    type: 'object',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    $ref: '#/$defs/_1'
                                }
                            }
                        }
                    }
                },
                '_1': {
                    type: 'object',
                    properties: {
                        d: {
                            type: 'string'
                        }
                    }
                }
            }
        };
        assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
    });
    test('getCompressedContent 5', () => {
        const schema = {
            type: 'object',
            properties: {
                a: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            c: {
                                type: 'object',
                                properties: {
                                    d: {
                                        type: 'string'
                                    }
                                }
                            }
                        }
                    }
                },
                e: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            c: {
                                type: 'object',
                                properties: {
                                    d: {
                                        type: 'string'
                                    }
                                }
                            }
                        }
                    }
                },
                f: {
                    type: 'object',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    type: 'object',
                                    properties: {
                                        d: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                g: {
                    type: 'object',
                    properties: {
                        b: {
                            type: 'object',
                            properties: {
                                c: {
                                    type: 'object',
                                    properties: {
                                        d: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const expected = {
            type: 'object',
            properties: {
                a: {
                    $ref: '#/$defs/_0'
                },
                e: {
                    $ref: '#/$defs/_0'
                },
                f: {
                    $ref: '#/$defs/_1'
                },
                g: {
                    $ref: '#/$defs/_1'
                }
            },
            $defs: {
                '_0': {
                    type: 'array',
                    items: {
                        $ref: '#/$defs/_2'
                    }
                },
                '_1': {
                    type: 'object',
                    properties: {
                        b: {
                            $ref: '#/$defs/_2'
                        }
                    }
                },
                '_2': {
                    type: 'object',
                    properties: {
                        c: {
                            type: 'object',
                            properties: {
                                d: {
                                    type: 'string'
                                }
                            }
                        }
                    }
                }
            }
        };
        assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblNjaGVtYS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9qc29uU2NoZW1hLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxvQkFBb0IsRUFBZSxNQUFNLDRCQUE0QixDQUFDO0FBQy9FLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUVyRSxLQUFLLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtJQUV6Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7UUFFbkMsTUFBTSxNQUFNLEdBQWdCO1lBQzNCLElBQUksRUFBRSxRQUFRO1lBQ2QsVUFBVSxFQUFFO2dCQUNYLENBQUMsRUFBRTtvQkFDRixJQUFJLEVBQUUsUUFBUTtvQkFDZCxXQUFXLEVBQUUsR0FBRztvQkFDaEIsVUFBVSxFQUFFO3dCQUNYLENBQUMsRUFBRTs0QkFDRixJQUFJLEVBQUUsUUFBUTs0QkFDZCxVQUFVLEVBQUU7Z0NBQ1gsQ0FBQyxFQUFFO29DQUNGLElBQUksRUFBRSxRQUFRO29DQUNkLFVBQVUsRUFBRTt3Q0FDWCxDQUFDLEVBQUU7NENBQ0YsSUFBSSxFQUFFLFFBQVE7eUNBQ2Q7cUNBQ0Q7aUNBQ0Q7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0Q7Z0JBQ0QsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxRQUFRO29CQUNkLFdBQVcsRUFBRSxHQUFHO29CQUNoQixVQUFVLEVBQUU7d0JBQ1gsQ0FBQyxFQUFFOzRCQUNGLElBQUksRUFBRSxRQUFROzRCQUNkLFVBQVUsRUFBRTtnQ0FDWCxDQUFDLEVBQUU7b0NBQ0YsSUFBSSxFQUFFLFFBQVE7b0NBQ2QsVUFBVSxFQUFFO3dDQUNYLENBQUMsRUFBRTs0Q0FDRixJQUFJLEVBQUUsUUFBUTt5Q0FDZDtxQ0FDRDtpQ0FDRDs2QkFDRDt5QkFDRDtxQkFDRDtpQkFDRDthQUNEO1NBQ0QsQ0FBQztRQUVGLE1BQU0sUUFBUSxHQUFnQjtZQUM3QixJQUFJLEVBQUUsUUFBUTtZQUNkLFVBQVUsRUFBRTtnQkFDWCxDQUFDLEVBQUU7b0JBQ0YsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsV0FBVyxFQUFFLEdBQUc7b0JBQ2hCLFVBQVUsRUFBRTt3QkFDWCxDQUFDLEVBQUU7NEJBQ0YsSUFBSSxFQUFFLFlBQVk7eUJBQ2xCO3FCQUNEO2lCQUNEO2dCQUNELENBQUMsRUFBRTtvQkFDRixJQUFJLEVBQUUsUUFBUTtvQkFDZCxXQUFXLEVBQUUsR0FBRztvQkFDaEIsVUFBVSxFQUFFO3dCQUNYLENBQUMsRUFBRTs0QkFDRixJQUFJLEVBQUUsWUFBWTt5QkFDbEI7cUJBQ0Q7aUJBQ0Q7YUFDRDtZQUNELEtBQUssRUFBRTtnQkFDTixJQUFJLEVBQUU7b0JBQ0wsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNYLENBQUMsRUFBRTs0QkFDRixJQUFJLEVBQUUsUUFBUTs0QkFDZCxVQUFVLEVBQUU7Z0NBQ1gsQ0FBQyxFQUFFO29DQUNGLElBQUksRUFBRSxRQUFRO2lDQUNkOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNEO2FBQ0Q7U0FFRCxDQUFDO1FBRUYsTUFBTSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDMUUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1FBRW5DLE1BQU0sTUFBTSxHQUFnQjtZQUMzQixJQUFJLEVBQUUsUUFBUTtZQUNkLFVBQVUsRUFBRTtnQkFDWCxDQUFDLEVBQUU7b0JBQ0YsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNYLENBQUMsRUFBRTs0QkFDRixJQUFJLEVBQUUsUUFBUTs0QkFDZCxVQUFVLEVBQUU7Z0NBQ1gsQ0FBQyxFQUFFO29DQUNGLElBQUksRUFBRSxRQUFRO29DQUNkLFVBQVUsRUFBRTt3Q0FDWCxDQUFDLEVBQUU7NENBQ0YsSUFBSSxFQUFFLFFBQVE7eUNBQ2Q7cUNBQ0Q7aUNBQ0Q7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0Q7Z0JBQ0QsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRTt3QkFDWCxDQUFDLEVBQUU7NEJBQ0YsSUFBSSxFQUFFLFFBQVE7NEJBQ2QsVUFBVSxFQUFFO2dDQUNYLENBQUMsRUFBRTtvQ0FDRixJQUFJLEVBQUUsUUFBUTtvQ0FDZCxVQUFVLEVBQUU7d0NBQ1gsQ0FBQyxFQUFFOzRDQUNGLElBQUksRUFBRSxRQUFRO3lDQUNkO3FDQUNEO2lDQUNEOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNEO2FBQ0Q7U0FDRCxDQUFDO1FBRUYsTUFBTSxRQUFRLEdBQWdCO1lBQzdCLElBQUksRUFBRSxRQUFRO1lBQ2QsVUFBVSxFQUFFO2dCQUNYLENBQUMsRUFBRTtvQkFDRixJQUFJLEVBQUUsWUFBWTtpQkFFbEI7Z0JBQ0QsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxZQUFZO2lCQUNsQjthQUNEO1lBQ0QsS0FBSyxFQUFFO2dCQUNOLElBQUksRUFBRTtvQkFDTCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1gsQ0FBQyxFQUFFOzRCQUNGLElBQUksRUFBRSxRQUFROzRCQUNkLFVBQVUsRUFBRTtnQ0FDWCxDQUFDLEVBQUU7b0NBQ0YsSUFBSSxFQUFFLFFBQVE7b0NBQ2QsVUFBVSxFQUFFO3dDQUNYLENBQUMsRUFBRTs0Q0FDRixJQUFJLEVBQUUsUUFBUTt5Q0FDZDtxQ0FDRDtpQ0FDRDs2QkFDRDt5QkFDRDtxQkFDRDtpQkFDRDthQUNEO1NBRUQsQ0FBQztRQUVGLE1BQU0sQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQzFFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtRQUduQyxNQUFNLE1BQU0sR0FBZ0I7WUFDM0IsSUFBSSxFQUFFLFFBQVE7WUFDZCxVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxRQUFRO29CQUNkLEtBQUssRUFBRTt3QkFDTjs0QkFDQyxLQUFLLEVBQUU7Z0NBQ047b0NBQ0MsVUFBVSxFQUFFO3dDQUNYLElBQUksRUFBRTs0Q0FDTCxJQUFJLEVBQUUsUUFBUTt5Q0FDZDt3Q0FDRCxXQUFXLEVBQUU7NENBQ1osSUFBSSxFQUFFLFFBQVE7eUNBQ2Q7cUNBQ0Q7aUNBQ0Q7Z0NBQ0Q7b0NBQ0MsVUFBVSxFQUFFO3dDQUNYLE1BQU0sRUFBRTs0Q0FDUCxJQUFJLEVBQUUsUUFBUTt5Q0FDZDtxQ0FDRDtpQ0FDRDs2QkFDRDt5QkFDRDt3QkFDRDs0QkFDQyxLQUFLLEVBQUU7Z0NBQ047b0NBQ0MsVUFBVSxFQUFFO3dDQUNYLElBQUksRUFBRTs0Q0FDTCxJQUFJLEVBQUUsUUFBUTt5Q0FDZDt3Q0FDRCxXQUFXLEVBQUU7NENBQ1osSUFBSSxFQUFFLFFBQVE7eUNBQ2Q7cUNBQ0Q7aUNBQ0Q7Z0NBQ0Q7b0NBQ0MsVUFBVSxFQUFFO3dDQUNYLEtBQUssRUFBRTs0Q0FDTixJQUFJLEVBQUUsUUFBUTt5Q0FDZDtxQ0FDRDtpQ0FDRDs2QkFDRDt5QkFDRDt3QkFDRDs0QkFDQyxLQUFLLEVBQUU7Z0NBQ047b0NBQ0MsVUFBVSxFQUFFO3dDQUNYLElBQUksRUFBRTs0Q0FDTCxJQUFJLEVBQUUsUUFBUTt5Q0FDZDt3Q0FDRCxXQUFXLEVBQUU7NENBQ1osSUFBSSxFQUFFLFFBQVE7eUNBQ2Q7cUNBQ0Q7aUNBQ0Q7Z0NBQ0Q7b0NBQ0MsVUFBVSxFQUFFO3dDQUNYLFFBQVEsRUFBRTs0Q0FDVCxJQUFJLEVBQUUsUUFBUTt5Q0FDZDtxQ0FDRDtpQ0FDRDs2QkFDRDt5QkFDRDtxQkFDRDtpQkFDRDtnQkFDRCxDQUFDLEVBQUU7b0JBQ0YsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNYLE1BQU0sRUFBRTs0QkFDUCxVQUFVLEVBQUU7Z0NBQ1gsTUFBTSxFQUFFO29DQUNQLElBQUksRUFBRSxRQUFRO2lDQUNkOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNEO2FBQ0Q7U0FDRCxDQUFDO1FBRUYsTUFBTSxRQUFRLEdBQWdCO1lBQzdCLE1BQU0sRUFBRSxRQUFRO1lBQ2hCLFlBQVksRUFBRTtnQkFDYixHQUFHLEVBQUU7b0JBQ0osTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLE9BQU8sRUFBRTt3QkFDUjs0QkFDQyxPQUFPLEVBQUU7Z0NBQ1I7b0NBQ0MsTUFBTSxFQUFFLFlBQVk7aUNBQ3BCO2dDQUNEO29DQUNDLE1BQU0sRUFBRSxZQUFZO2lDQUNwQjs2QkFDRDt5QkFDRDt3QkFDRDs0QkFDQyxPQUFPLEVBQUU7Z0NBQ1I7b0NBQ0MsTUFBTSxFQUFFLFlBQVk7aUNBQ3BCO2dDQUNEO29DQUNDLFlBQVksRUFBRTt3Q0FDYixPQUFPLEVBQUU7NENBQ1IsTUFBTSxFQUFFLFFBQVE7eUNBQ2hCO3FDQUNEO2lDQUNEOzZCQUNEO3lCQUNEO3dCQUNEOzRCQUNDLE9BQU8sRUFBRTtnQ0FDUjtvQ0FDQyxNQUFNLEVBQUUsWUFBWTtpQ0FDcEI7Z0NBQ0Q7b0NBQ0MsWUFBWSxFQUFFO3dDQUNiLFVBQVUsRUFBRTs0Q0FDWCxNQUFNLEVBQUUsUUFBUTt5Q0FDaEI7cUNBQ0Q7aUNBQ0Q7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0Q7Z0JBQ0QsR0FBRyxFQUFFO29CQUNKLE1BQU0sRUFBRSxRQUFRO29CQUNoQixZQUFZLEVBQUU7d0JBQ2IsUUFBUSxFQUFFOzRCQUNULE1BQU0sRUFBRSxZQUFZO3lCQUNwQjtxQkFDRDtpQkFDRDthQUNEO1lBQ0QsT0FBTyxFQUFFO2dCQUNSLElBQUksRUFBRTtvQkFDTCxZQUFZLEVBQUU7d0JBQ2IsTUFBTSxFQUFFOzRCQUNQLE1BQU0sRUFBRSxRQUFRO3lCQUNoQjt3QkFDRCxhQUFhLEVBQUU7NEJBQ2QsTUFBTSxFQUFFLFFBQVE7eUJBQ2hCO3FCQUNEO2lCQUNEO2dCQUNELElBQUksRUFBRTtvQkFDTCxZQUFZLEVBQUU7d0JBQ2IsUUFBUSxFQUFFOzRCQUNULE1BQU0sRUFBRSxRQUFRO3lCQUNoQjtxQkFDRDtpQkFDRDthQUNEO1NBQ0QsQ0FBQztRQUVGLE1BQU0sTUFBTSxHQUFHLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUNwRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7UUFFbkMsTUFBTSxNQUFNLEdBQWdCO1lBQzNCLElBQUksRUFBRSxRQUFRO1lBQ2QsVUFBVSxFQUFFO2dCQUNYLENBQUMsRUFBRTtvQkFDRixJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1gsQ0FBQyxFQUFFOzRCQUNGLElBQUksRUFBRSxRQUFROzRCQUNkLFVBQVUsRUFBRTtnQ0FDWCxDQUFDLEVBQUU7b0NBQ0YsSUFBSSxFQUFFLFFBQVE7b0NBQ2QsVUFBVSxFQUFFO3dDQUNYLENBQUMsRUFBRTs0Q0FDRixJQUFJLEVBQUUsUUFBUTt5Q0FDZDtxQ0FDRDtpQ0FDRDs2QkFDRDt5QkFDRDtxQkFDRDtpQkFDRDtnQkFDRCxDQUFDLEVBQUU7b0JBQ0YsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNYLENBQUMsRUFBRTs0QkFDRixJQUFJLEVBQUUsUUFBUTs0QkFDZCxVQUFVLEVBQUU7Z0NBQ1gsQ0FBQyxFQUFFO29DQUNGLElBQUksRUFBRSxRQUFRO29DQUNkLFVBQVUsRUFBRTt3Q0FDWCxDQUFDLEVBQUU7NENBQ0YsSUFBSSxFQUFFLFFBQVE7eUNBQ2Q7cUNBQ0Q7aUNBQ0Q7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0Q7Z0JBQ0QsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRTt3QkFDWCxDQUFDLEVBQUU7NEJBQ0YsSUFBSSxFQUFFLFFBQVE7eUJBQ2Q7cUJBQ0Q7aUJBQ0Q7YUFDRDtTQUNELENBQUM7UUFFRixNQUFNLFFBQVEsR0FBZ0I7WUFDN0IsSUFBSSxFQUFFLFFBQVE7WUFDZCxVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxZQUFZO2lCQUNsQjtnQkFDRCxDQUFDLEVBQUU7b0JBQ0YsSUFBSSxFQUFFLFlBQVk7aUJBQ2xCO2dCQUNELENBQUMsRUFBRTtvQkFDRixJQUFJLEVBQUUsWUFBWTtpQkFDbEI7YUFDRDtZQUNELEtBQUssRUFBRTtnQkFDTixJQUFJLEVBQUU7b0JBQ0wsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNYLENBQUMsRUFBRTs0QkFDRixJQUFJLEVBQUUsUUFBUTs0QkFDZCxVQUFVLEVBQUU7Z0NBQ1gsQ0FBQyxFQUFFO29DQUNGLElBQUksRUFBRSxZQUFZO2lDQUNsQjs2QkFDRDt5QkFDRDtxQkFDRDtpQkFDRDtnQkFDRCxJQUFJLEVBQUU7b0JBQ0wsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNYLENBQUMsRUFBRTs0QkFDRixJQUFJLEVBQUUsUUFBUTt5QkFDZDtxQkFDRDtpQkFDRDthQUNEO1NBRUQsQ0FBQztRQUVGLE1BQU0sQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQzFFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtRQUVuQyxNQUFNLE1BQU0sR0FBZ0I7WUFDM0IsSUFBSSxFQUFFLFFBQVE7WUFDZCxVQUFVLEVBQUU7Z0JBQ1gsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxPQUFPO29CQUNiLEtBQUssRUFBRTt3QkFDTixJQUFJLEVBQUUsUUFBUTt3QkFDZCxVQUFVLEVBQUU7NEJBQ1gsQ0FBQyxFQUFFO2dDQUNGLElBQUksRUFBRSxRQUFRO2dDQUNkLFVBQVUsRUFBRTtvQ0FDWCxDQUFDLEVBQUU7d0NBQ0YsSUFBSSxFQUFFLFFBQVE7cUNBQ2Q7aUNBQ0Q7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0Q7Z0JBQ0QsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxPQUFPO29CQUNiLEtBQUssRUFBRTt3QkFDTixJQUFJLEVBQUUsUUFBUTt3QkFDZCxVQUFVLEVBQUU7NEJBQ1gsQ0FBQyxFQUFFO2dDQUNGLElBQUksRUFBRSxRQUFRO2dDQUNkLFVBQVUsRUFBRTtvQ0FDWCxDQUFDLEVBQUU7d0NBQ0YsSUFBSSxFQUFFLFFBQVE7cUNBQ2Q7aUNBQ0Q7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0Q7Z0JBQ0QsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRTt3QkFDWCxDQUFDLEVBQUU7NEJBQ0YsSUFBSSxFQUFFLFFBQVE7NEJBQ2QsVUFBVSxFQUFFO2dDQUNYLENBQUMsRUFBRTtvQ0FDRixJQUFJLEVBQUUsUUFBUTtvQ0FDZCxVQUFVLEVBQUU7d0NBQ1gsQ0FBQyxFQUFFOzRDQUNGLElBQUksRUFBRSxRQUFRO3lDQUNkO3FDQUNEO2lDQUNEOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNEO2dCQUNELENBQUMsRUFBRTtvQkFDRixJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1gsQ0FBQyxFQUFFOzRCQUNGLElBQUksRUFBRSxRQUFROzRCQUNkLFVBQVUsRUFBRTtnQ0FDWCxDQUFDLEVBQUU7b0NBQ0YsSUFBSSxFQUFFLFFBQVE7b0NBQ2QsVUFBVSxFQUFFO3dDQUNYLENBQUMsRUFBRTs0Q0FDRixJQUFJLEVBQUUsUUFBUTt5Q0FDZDtxQ0FDRDtpQ0FDRDs2QkFDRDt5QkFDRDtxQkFDRDtpQkFDRDthQUNEO1NBQ0QsQ0FBQztRQUVGLE1BQU0sUUFBUSxHQUFnQjtZQUM3QixJQUFJLEVBQUUsUUFBUTtZQUNkLFVBQVUsRUFBRTtnQkFDWCxDQUFDLEVBQUU7b0JBQ0YsSUFBSSxFQUFFLFlBQVk7aUJBQ2xCO2dCQUNELENBQUMsRUFBRTtvQkFDRixJQUFJLEVBQUUsWUFBWTtpQkFDbEI7Z0JBQ0QsQ0FBQyxFQUFFO29CQUNGLElBQUksRUFBRSxZQUFZO2lCQUNsQjtnQkFDRCxDQUFDLEVBQUU7b0JBQ0YsSUFBSSxFQUFFLFlBQVk7aUJBQ2xCO2FBQ0Q7WUFDRCxLQUFLLEVBQUU7Z0JBQ04sSUFBSSxFQUFFO29CQUNMLElBQUksRUFBRSxPQUFPO29CQUNiLEtBQUssRUFBRTt3QkFDTixJQUFJLEVBQUUsWUFBWTtxQkFDbEI7aUJBQ0Q7Z0JBQ0QsSUFBSSxFQUFFO29CQUNMLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRTt3QkFDWCxDQUFDLEVBQUU7NEJBQ0YsSUFBSSxFQUFFLFlBQVk7eUJBQ2xCO3FCQUNEO2lCQUNEO2dCQUNELElBQUksRUFBRTtvQkFDTCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1gsQ0FBQyxFQUFFOzRCQUNGLElBQUksRUFBRSxRQUFROzRCQUNkLFVBQVUsRUFBRTtnQ0FDWCxDQUFDLEVBQUU7b0NBQ0YsSUFBSSxFQUFFLFFBQVE7aUNBQ2Q7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0Q7YUFDRDtTQUVELENBQUM7UUFFRixNQUFNLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUMxRSxDQUFDLENBQUMsQ0FBQztBQUdKLENBQUMsQ0FBQyxDQUFDIn0=