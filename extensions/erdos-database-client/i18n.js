const p=require('./package.json')
const content={}
for (const command of p.contributes.commands) {
    const key = command.command.replace("mysql", 'command');
    content[key]=command.title;
    command.title=`%${key}%`
}
console.log(JSON.stringify(content))
console.log('--------------------------------------------')
console.log(JSON.stringify(p.contributes.commands))