/**
 * Game Settings lists a package's menu buttons first and its settings after,
 * each in registration order. This puts chosen entries of the system's tab
 * first, in the order given; the rest follow as Foundry lists them.
 */
export const SETTINGS_ORDER = [
	"dateTime",
	"clockPaused",
	"conditionsSkipMissingPlayers",
];

/** Entries put last, in this order, under their own section headings. */
export const SETTINGS_SECTIONS = [
	{ title: "Float Speech", keys: ["floatSpeechFontSize", "floatSpeechHeight", "floatSpeechDuration"] },
];
const SECTION_KEYS = SETTINGS_SECTIONS.flatMap(s => s.keys);

export function orderSystemSettings() {
	const SettingsConfig = foundry.applications.settings.SettingsConfig;
	const prepare = SettingsConfig.prototype._prepareCategoryData;
	SettingsConfig.prototype._prepareCategoryData = function(...args) {
		const categories = prepare.apply(this, args);
		const system = categories.system;
		if (!system) {
			return categories;
		}
		const keyOf = e => (e.menu ? e.key : e.field?.name)?.replace(`${SYSTEM_ID}.`, "");
		const rank = e => {
			const key = keyOf(e);
			const i = SETTINGS_ORDER.indexOf(key);
			if (i >= 0) {
				return i;
			}
			const j = SECTION_KEYS.indexOf(key);
			return j < 0 ? SETTINGS_ORDER.length : SETTINGS_ORDER.length + 1 + j;
		};
		// stable sort: unlisted entries keep Foundry's order
		system.entries = system.entries
			.map((e, i) => [e, i])
			.sort(([a, i], [b, j]) => (rank(a) - rank(b)) || (i - j))
			.map(([e]) => e);
		return categories;
	};
}

/** Section headings above the first entry of each SETTINGS_SECTIONS group. */
export function addSettingsSections(app, element) {
	for (const { title, keys } of SETTINGS_SECTIONS) {
		const input = element.querySelector(`[name="${SYSTEM_ID}.${keys[0]}"]`);
		const group = input?.closest(".form-group");
		if (!group || group.previousElementSibling?.classList.contains("fallout-settings-section")) {
			continue;
		}
		const heading = document.createElement("h3");
		heading.className = "fallout-settings-section";
		heading.textContent = title;
		group.before(heading);
	}
}
