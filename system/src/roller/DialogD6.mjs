import { RollerPanel } from "./RollerPanel.mjs";

/** Highest Damage and Extra Dice the gun panel's counters reach. */
const MAX_DAMAGE = 99;
const MAX_EXTRA_DICE = 9;

/** The actor a dialog's actor UUID points at (an Actor, or a Scene token's actor). */
function actorOf(uuid) {
	if (!uuid) {
		return null;
	}
	if (uuid.startsWith("Actor")) {
		return fromUuidSync(uuid);
	}
	if (uuid.startsWith("Scene")) {
		return fromUuidSync(uuid)?.actor ?? null;
	}
	return null;
}

export class DialogD6 extends Dialog {

	constructor(rollName, diceNum, actor, weapon, falloutRoll, dialogData = {}, options = {}) {
		super(dialogData, options);
		this.rollName = rollName;
		this.diceNum = diceNum;
		this.actor = actor;
		this.weapon = weapon;
		this.falloutRoll = falloutRoll;
		this.options.classes = ["dice-icon"];
		if (options.panelLimits) {
			this.options.classes.push("forkout-roller-app");
		}
	}

	/**
	 * How far a weapon's Fire Rate dial can go: the weapon's Fire Rate (with
	 * its mods), and no more extra shots than the ammo carried pays for
	 * (ammo per shot each; a Gatling burst of +2 CD costs one shot's worth).
	 * @returns {{max: number, weapon: number, ammo: number|null}}
	 */
	static fireRateLimit(weapon, actorUuid) {
		const rate = Math.max(0, parseInt(weapon?.system?.fireRate) || 0);
		const result = { max: rate, weapon: rate, ammo: null };
		if (!game.settings.get("fallout", "automaticAmmunitionCalculation") || !weapon?.system?.ammo) {
			return result;
		}
		const actor = actorOf(actorUuid);
		if (!actor || !["character", "robot", "vehicle"].includes(actor.type)) {
			return result;
		}
		const [ammoItems, shotsAvailable] = actor._getAvailableAmmoType(weapon.system.ammo);
		const perStep = Math.max(1, parseInt(weapon.system.ammoPerShot) || 1);
		result.ammo = ammoItems ? Math.floor((shotsAvailable ?? 0) / perStep) : 0;
		result.max = Math.min(rate, result.ammo);
		return result;
	}

	activateListeners(html) {
		const me = this;

		super.activateListeners(html);

		const panelLimits = this.options.panelLimits;
		if (panelLimits) {
			new RollerPanel(html, panelLimits).activate();
			html.on("click", ".fr-roll", () => {
				this.element.find('.dialog-button[data-button="roll"]').trigger("click");
			});
		}

		html.on("click", ".roll", async event => {
			let extraDiceNum = parseInt(html.find(".extra-dice")[0]?.value ?? 0);
			let fireRate = parseInt(html.find(".fire-rate")[0]?.value ?? 0);
			let diceNum = parseInt(html.find(".damage-dice")[0]?.value ?? 1);

			me.weapon = me.weapon?.constructor.name === "Object"
				? await fromUuid(me.weapon.uuid)
				: me.weapon;

			const gatlingWeapon = me.weapon?.hasWeaponQuality("gatling") ?? false;
			let multiplier = gatlingWeapon ? 2 : 1;

			if (!diceNum) {
				diceNum = me.diceNum;
			}

			if (fireRate && fireRate > 0) {
				diceNum += (fireRate * multiplier);
			}

			let additionalAmmo = 0;
			// CHECK IF THERE IS ENOUGH AMMO TO TRIGGER THE ROLL
			if (game.settings.get("fallout", "automaticAmmunitionCalculation")) {
				if (me.weapon?.system.ammo) {
					// the gun panel: only Fire Rate shots cost ammo, whatever
					// the Damage dial was turned to
					let initDmg = me.falloutRoll
						? 0
						: (panelLimits
							? parseInt(html.find(".damage-dice")[0]?.value ?? 0)
							: me.weapon.system.damage.rating);

					additionalAmmo = await me.checkAmmo(diceNum, initDmg);

					if (additionalAmmo < 0) {
						return;
					}
				}
			}

			if (!me.falloutRoll) {
				fallout.Roller2D20.rollD6({
					rollname: me.rollName,
					dicenum: diceNum + extraDiceNum,
					weapon: me.weapon,
					actor: me.actor,
				});
			}
			else {
				fallout.Roller2D20.addD6({
					rollname: me.rollName,
					dicenum: diceNum + extraDiceNum,
					weapon: me.weapon,
					actor: me.actor,
					falloutRoll: me.falloutRoll,
				});
			}

			// REDUCE AMMO FOR CHARACTER AND ROBOT
			if (game.settings.get("fallout", "automaticAmmunitionCalculation")) {
				if (!me.actor) {
					return;
				}

				let _actor;
				if (me.actor.startsWith("Actor")) {
					_actor = fromUuidSync(me.actor);
				}
				else if (me.actor.startsWith("Scene")) {
					_actor = fromUuidSync(me.actor).actor;
				}

				if (["character", "robot", "vehicle"].includes(_actor.type)) {
					if (additionalAmmo > 0) {
						await _actor.reduceAmmo(me.weapon.system.ammo, additionalAmmo);
					}
				}
			}
		});
	}

	async rollD6() {

	}

	async addD6() {

	}

	static async createDialog({
		rollName = "DC Roll",
		diceNum = 2,
		falloutRoll = null,
		actor = null,
		weapon = null,
	} = {}) {
		let dialogData = {};

		dialogData.rollName = rollName;
		dialogData.diceNum = diceNum;
		dialogData.falloutRoll = falloutRoll;
		dialogData.weapon = weapon;
		dialogData.actor = actor;

		let html;
		let dialogWidth = 300;
		let panelLimits = null;

		// weapons with a Fire Rate get the gun damage panel
		const weaponDoc = (weapon?.constructor?.name === "Object" && weapon.uuid)
			? await fromUuid(weapon.uuid)
			: weapon;
		const rate = parseInt(weaponDoc?.system?.fireRate) || 0;

		if (weaponDoc && !falloutRoll && (rate > 0)) {
			const limit = DialogD6.fireRateLimit(weaponDoc, actor);
			dialogData.diceNum = Math.max(0, Math.min(MAX_DAMAGE, parseInt(diceNum) || 0));
			dialogData.fireRateTip = `${game.i18n.localize("FALLOUT.TEMPLATES.Fire_Rate")}: ${limit.max}`
				+ ((limit.ammo !== null && limit.ammo < limit.weapon)
					? ` (${limit.weapon}, ammo for ${limit.ammo})`
					: "");
			panelLimits = {
				damage: [0, MAX_DAMAGE],
				fireRate: [0, limit.max],
				extraDice: [0, MAX_EXTRA_DICE],
			};
			html = await foundry.applications.handlebars.renderTemplate("systems/fallout/templates/dialogs/dialogd6-guns.hbs", dialogData);
			dialogWidth = 560;
		}
		else if (weapon && !falloutRoll) {
			html = await foundry.applications.handlebars.renderTemplate("systems/fallout/templates/dialogs/dialogd6.hbs", dialogData);
			dialogWidth = 465;
		}
		else {
			html = await foundry.applications.handlebars.renderTemplate("systems/fallout/templates/dialogs/dialogd6-simple.hbs", dialogData);
		}

		let d = new DialogD6(rollName, diceNum, actor, weapon, falloutRoll, {
			title: rollName,
			content: html,
			buttons: {
				roll: {
					icon: '<i class="fas fa-check"></i>',
					label: "ROLL",
				},
			},
			close: () => { },
			default: panelLimits ? "roll" : undefined,
		}, {width: dialogWidth, panelLimits});
		d.render(true);
	}

	async checkAmmo(diceNum, initDmg) {
		if (!game.settings.get("fallout", "automaticAmmunitionCalculation")) {
			return 0;
		}

		if (!this.actor) {
			return 0;
		}

		if (!this.weapon) {
			return 0;
		}

		if (this.weapon.system.ammo === "") {
			return 0;
		}

		// Check if there is ammo at all
		let _actor;
		if (this.actor.startsWith("Actor")) {
			_actor = fromUuidSync(this.actor);
		}
		else if (this.actor.startsWith("Scene")) {
			_actor = fromUuidSync(this.actor).actor;
		}

		if (!_actor) {
			return 0;
		}

		if (!["character", "robot", "vehicle"].includes(_actor.type)) {
			return 0;
		}

		const [ammoItems, shotsAvailable] =
			_actor._getAvailableAmmoType(
				this.weapon.system.ammo
			);

		if (!ammoItems) {
			ui.notifications.warn(`Ammo ${this.weapon.system.ammo} not found`);
			return -1;
		}

		const weaponType = this.weapon?.system?.weaponType ?? "";

		// Check if there is enough ammo
		const totalDice = parseInt(diceNum);
		const weaponDmg = parseInt(initDmg);

		// Don't include bonus melee damage dice in the calculation
		const bonusDamage = ["meleeWeapons", "unarmed"].includes(weaponType)
			? _actor.system.meleeDamage.value
			: 0;

		let additionalAmmo = Math.max(0, totalDice - weaponDmg - bonusDamage)
			* this.weapon.system.ammoPerShot;

		// Gatling weird shit where you need to add 2DC and spend 10 ammmo...
		if (this.weapon && this.weapon.hasWeaponQuality("gatling")) {
			additionalAmmo = Math.floor(additionalAmmo * 0.5);
		}

		if (shotsAvailable < additionalAmmo) {
			ui.notifications.warn(`Not enough ${this.weapon.system.ammo} ammo`);
			return -1;
		}

		return additionalAmmo;
	}
}
