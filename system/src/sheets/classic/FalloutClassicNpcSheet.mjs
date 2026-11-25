import FalloutNpcSheet from "../FalloutNpcSheet.mjs";
import { ClassicSheetMixin } from "./ClassicSheetMixin.mjs";

/** Classic green-screen sheet for NPCs. */
export default class FalloutClassicNpcSheet extends ClassicSheetMixin(FalloutNpcSheet) {

	/** @override */
	get template() {
		return "systems/fallout/templates/actor/classic/npc-sheet.hbs";
	}

	/** @override */
	get classicButtons() {
		return [
			{ tab: "abilities", label: "FALLOUT.TEMPLATES.Abilities" },
			{ tab: "skills", label: "FALLOUT.TEMPLATES.Skills" },
			{ tab: "gear", label: "FALLOUT.TEMPLATES.Gear" },
			{ tab: "data", label: "FALLOUT.TEMPLATES.Data" },
			null,
			null,
		];
	}
}
