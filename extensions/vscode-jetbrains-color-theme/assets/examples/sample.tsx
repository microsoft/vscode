interface Props<T> {
    items: T[];
    renderItem: (item: T) => ReactNode;
  }

  const List = <T extends unknown>({ items, renderItem }: Props<T>) => (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{renderItem(item)}</li>
      ))}
    </ul>
  );
