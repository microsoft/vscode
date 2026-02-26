import { Table } from 'antd';

export default function AdminPanel() {
  return <div>
    <h1 className="text-xl font-bold mb-4">پنل ادمین</h1>
    <Table rowKey="id" dataSource={[{id:1,name:'کاربر ۱',status:'active'}]} columns={[{title:'نام',dataIndex:'name'},{title:'وضعیت',dataIndex:'status'}]} />
  </div>;
}
