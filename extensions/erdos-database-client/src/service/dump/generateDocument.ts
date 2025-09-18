export class DumpDocument {

    public static tableStyle = {
        // tableColWidth: 4261,
        sz: 15,
        align: 'center',
        // tableSize: 24,
        // tableColor: 'ada',
        borders: true, 
        borderSize: 1, 
        tableAlign: 'left',
        tableFontFamily: 'Microsoft YaHei',
        columns: [{ width: 20 }, { width: 20 }, { width: 20 },{ width: 40 },{ width: 20 },{ width: 20 }],
    }

    public static header = [
        {
            val: 'Column',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '25'
                }
            }
        },
        {
            val: 'Type',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '25'
                }
            }
        },
        {
            val: 'Comment',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '25'
                }
            }
        },
        {
            val: 'PK',
            opts: {
                cellColWidth: 400,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '25'
                }
            }
        },

        {
            val: 'Nullable',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '25'
                }
            }
        },
        {
            val: 'Default',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '25'
                }
            }
        },
    ];

}