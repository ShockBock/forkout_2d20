import FalloutPcSheet from "../FalloutPcSheet.mjs";
import { ClassicSheetMixin } from "./ClassicSheetMixin.mjs";

/** Classic green-screen sheet for characters and robots. */
export default class FalloutClassicPcSheet extends ClassicSheetMixin(FalloutPcSheet) {

	/** @override */
	static get defaultOptions() {
		const options = super.defaultOptions;
		options.classes = [...options.classes, "classic-pc"];
		return options;
	}

	/** @override */
	get template() {
		return "systems/fallout/templates/actor/classic/pc-sheet.hbs";
	}

	/** @override */
	get classicButtons() {
		return [
			{ tab: "status", label: "FALLOUT.TEMPLATES.Status" },
			{ tab: "abilities", label: "FALLOUT.TEMPLATES.Abilities" },
			{ tab: "weapons", label: "FALLOUT.TEMPLATES.Weapons" },
			{ tab: "apparel", label: "FALLOUT.TEMPLATES.Apparel" },
			{ tab: "inventory", label: "FALLOUT.TEMPLATES.Gear" },
			{ tab: "data", label: "FALLOUT.TEMPLATES.Data" },
		];
	}
}
