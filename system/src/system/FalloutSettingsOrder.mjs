/**
 * Game Settings lists a package's menu buttons first and its settings after,
 * each in registration order. This puts chosen entries of the system's tab
 * first, in the order given; the rest follow as Foundry lists them.
 */
export const SETTINGS_ORDER = [
	"dateTime",
	"conditionsSkipMissingPlayers",
];

export function orderSystemSettings() {
	const SettingsConfig = foundry.applications.settings.SettingsConfig;
	const prepare = SettingsConfig.prototype._prepareCategoryData;
	SettingsConfig.prototype._prepareCategoryData = function(...args) {
		const categories = prepare.apply(this, args);
		const system = categories.system;
		if (!system) return categories;
		const keyOf = e => (e.menu ? e.key : e.field?.name)?.replace(`${SYSTEM_ID}.`, "");
		const rank = e => {
			const i = SETTINGS_ORDER.indexOf(keyOf(e));
			return i < 0 ? SETTINGS_ORDER.length : i;
		};
		// stable sort: unlisted entries keep Foundry's order
		system.entries = system.entries
			.map((e, i) => [e, i])
			.sort(([a, i], [b, j]) => (rank(a) - rank(b)) || (i - j))
			.map(([e]) => e);
		return categories;
	};
}
