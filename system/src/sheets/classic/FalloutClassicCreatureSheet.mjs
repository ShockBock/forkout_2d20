import FalloutCreatureSheet from "../FalloutCreatureSheet.mjs";
import { ClassicSheetMixin } from "./ClassicSheetMixin.mjs";

/** Classic green-screen sheet for creatures. */
export default class FalloutClassicCreatureSheet extends ClassicSheetMixin(FalloutCreatureSheet) {

	/** @override */
	get template() {
		return "systems/fallout/templates/actor/classic/creature-sheet.hbs";
	}

	/** @override */
	get classicButtons() {
		return [
			{ tab: "abilities", label: "FALLOUT.TEMPLATES.Abilities" },
			{ tab: "butchery", label: "FALLOUT.TEMPLATES.Butchery" },
			{ tab: "gear", label: "FALLOUT.TEMPLATES.Salvage" },
			{ tab: "data", label: "FALLOUT.TEMPLATES.Data" },
			null,
			null,
		];
	}
}
