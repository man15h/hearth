// Server → client serialization helpers for integrations.
//
// Two responsibilities:
//   1. Strip non-serializable adapter pieces (functions, schema metadata) so
//      the registry can be sent over the wire.
//   2. Redact secret fields to a fixed bullet string so credentials never
//      leak through API responses.

const REDACTED = '••••••••';

export function adapterToClient(adapter) {
	return {
		id: adapter.id,
		name: adapter.name,
		icon: adapter.icon,
		description: adapter.description,
		configSchema: (adapter.configSchema || []).map((f) => ({
			key: f.key,
			type: f.type,
			label: f.label,
			required: !!f.required,
			placeholder: f.placeholder || '',
			help: f.help || '',
			fromOperatorDefault: f.fromOperatorDefault || null
		})),
		searchProviders: Object.fromEntries(
			Object.entries(adapter.searchProviders || {}).map(([key, p]) => [
				key,
				{ label: p.label, mode: p.mode }
			])
		)
	};
}

export function redactConfig(adapter, config) {
	const out = {};
	const schema = adapter.configSchema || [];
	const secretKeys = new Set(schema.filter((f) => f.type === 'secret').map((f) => f.key));
	for (const [k, v] of Object.entries(config || {})) {
		if (v == null || v === '') continue;
		out[k] = secretKeys.has(k) ? REDACTED : v;
	}
	return out;
}

export function isRedacted(value) {
	return value === REDACTED;
}
