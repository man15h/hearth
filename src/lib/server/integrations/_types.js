// JSDoc types for the integration adapter contract.
// Adapters are plain modules — there's no class to extend, no interface to
// implement. They default-export an object that matches `IntegrationAdapter`.
//
// Adding a new integration is one new file in this directory plus one line
// in `index.js` to import it. The rest of the framework — settings UI, API
// routes, search bar — discovers it generically through this contract.

/**
 * @typedef {Object} ConfigField
 * @property {string} key                       Stable id (used as the form name and the stored config key)
 * @property {'url'|'text'|'secret'} type       Renders as <input type="...">; 'secret' redacts to bullets in API responses
 * @property {string} label                     Human-readable label
 * @property {boolean} [required]               Defaults to false
 * @property {string} [placeholder]
 * @property {string} [help]                    Small helper text shown under the field
 * @property {string} [fromOperatorDefault]     If set, the form pre-fills from `integrations.<id>.<value>` in config.yml
 */

/**
 * @typedef {Object} TestResult
 * @property {boolean} ok
 * @property {string} message                   Shown verbatim in the UI — keep it short and human
 */

/**
 * @typedef {Object} SearchResultItem
 * @property {string} id
 * @property {string} title
 * @property {string} [thumbnail]               URL of an image; rendered as a tile
 * @property {string} href                      Where to send the user when they click
 * @property {Object} [meta]
 * @property {string} [meta.kind]               'photo' triggers the photo-grid variant in SearchResults
 * @property {string} [meta.takenAt]
 */

/**
 * @typedef {Object} SearchProvider
 * @property {string} label                     Shown in the provider switcher dropdown
 * @property {'inline'|'redirect'} mode         inline = dropdown of results; redirect = form-submit to an external URL
 * @property {(ctx: { config: object, query: string, limit: number, fetch: typeof fetch }) => Promise<{ results: SearchResultItem[] }>} query
 */

/**
 * @typedef {Object} IntegrationAdapter
 * @property {string} id                                       Must match the config.yml key
 * @property {string} name                                     Display name
 * @property {string} icon                                     Lucide / simple-icons id (e.g. 'di:immich') or full URL
 * @property {string} description                              One-line summary
 * @property {ConfigField[]} configSchema                      Fields rendered in the connect form
 * @property {(ctx: { config: object, fetch: typeof fetch }) => Promise<TestResult>} test
 * @property {Record<string, SearchProvider>} [searchProviders]
 * @property {Record<string, object>} [widgets]                Reserved — widget rendering is out of scope for this PR
 */

export {};
