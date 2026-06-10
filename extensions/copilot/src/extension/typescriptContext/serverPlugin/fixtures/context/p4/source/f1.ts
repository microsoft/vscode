export interface Name {
	name(): string;
}

export type NameLength = {
	length(): number;
}

export type Both = Name & NameLength;