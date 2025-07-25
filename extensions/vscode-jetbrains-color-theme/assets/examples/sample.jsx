function UserList({ users }) {
    const [selected, setSelected] = useState(null);

    return (
      <div className="container">
        {users.map(user => (
          <Card key={user.id} onClick={() => setSelected(user)}>
            <Avatar src={user.photo} alt={user.name} />
            <h2>{user.name}</h2>
            <p>{user.bio}</p>
          </Card>
        ))}
      </div>
    );
  }
