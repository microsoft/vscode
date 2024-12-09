import { ISecretStorageProvider } from 'vs/platform/secrets/common/secrets';
export class SecretStorageProvider implements ISecretStorageProvider {
	public type: 'persisted';
	private static instance: SecretStorageProvider;
	public getAuthToken: () => Promise<string>;

	constructor() {
		this.type = 'persisted';
		// Capture the window function
		this.getAuthToken = (window as any).globalIdeState.getAuthToken;
		(window as any).globalIdeState.getAuthToken = () => {
			throw new Error('This function is no longer available');
		};
	}

	public static getInstance(): SecretStorageProvider {
		if (!SecretStorageProvider.instance) {
			SecretStorageProvider.instance = new SecretStorageProvider();
		}
		return SecretStorageProvider.instance;
	}

	async get(key: string): Promise<string | undefined> {
		let extensionKey;
		try {
			// Check if the key is for an extension (it's a JSON string)
			extensionKey = JSON.parse(key);
		} catch (err) {
			// Only keys for extensions are stored as JSON so this must not be an extension secret.
		}
		if (
			extensionKey?.extensionId === 'membrane.membrane' &&
			extensionKey?.key === 'membraneApiToken'
		) {
			try {
				return await this.getAuthToken();
			} catch (error) {
				throw new Error(`Failed to read Membrane API token: ${error}`);
			}
		}
		return localStorage.getItem(key) ?? undefined;
	}

	async set(key: string, value: string): Promise<void> {
		localStorage.setItem(key, value);
	}

	async delete(key: string): Promise<void> {
		localStorage.removeItem(key);
	}
}


export async function membraneApi(
	method: 'GET' | 'POST',
	path: `/${string}`,
	body?: BodyInit
): Promise<Response> {
	// WARNING: It's important that this url is NOT controlled by the extension settings (i.e. the url used by the
	// extension and gaze) because this function is used to load the user settings themselves.
	const baseUrl = 'https://api.membrane.io';

	const secretProvider = SecretStorageProvider.getInstance();
	const token = await secretProvider.getAuthToken();

	if (!token) {
		throw new Error('Failed to retrieve Membrane API token');
	}

	return await fetch(`${baseUrl}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		body,
	});
}
