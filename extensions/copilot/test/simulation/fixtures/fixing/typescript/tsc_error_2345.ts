function create<T>(prototype: T, pojo: Object): T {
	return Object.create(prototype) as T;
}