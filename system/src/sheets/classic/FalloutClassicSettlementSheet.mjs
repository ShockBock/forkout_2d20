import FalloutSettlementSheet from "../FalloutSettlementSheet.mjs";
import { ClassicSheetMixin } from "./ClassicSheetMixin.mjs";

/** Classic green-screen sheet for settlements (no Effects tab). */
export default class FalloutClassicSettlementSheet extends ClassicSheetMixin(FalloutSettlementSheet) {

	/** @override */
	get template() {
		return "systems/fallout/templates/actor/classic/settlement-sheet.hbs";
	}

	/** @override */
	get classicButtons() {
		return [
			{ tab: "status", label: "FALLOUT.TEMPLATES.Status" },
			{ tab: "stockpile", label: "FALLOUT.TEMPLATES.Stockpile" },
			{ tab: "data", label: "FALLOUT.TEMPLATES.Data" },
			null,
			null,
			null,
		];
	}
}
