export default class FalloutConditionTracker {
	constructor() {
		this.lastWorldTime = null;
		this.updateIntervalSecs = 60;
	}

	get isDisabled() {
		return !this.isEnabled;
	}

	get isEnabled() {
		return game.settings.get(SYSTEM_ID, "syncConditionsWithWorldClock");
	}

	/**
	 * The characters whose Hunger, Thirst and Sleep follow the clock: every
	 * player-owned character, plus every character with a token on the active
	 * scene, a scene in the navigation bar, or a scene a logged-in user is viewing. An unlinked token is
	 * tracked as its own (synthetic) actor, so the change shows on that token.
	 */
	trackedActors() {
		const actors = new Map();
		for (const actor of game.actors) {
			if (actor.type === "character" && actor.hasPlayerOwner) actors.set(actor.uuid, actor);
		}
		const scenes = new Set([
			game.scenes.active,
			...game.scenes.filter(s => s.navigation),
			...game.users.filter(u => u.active).map(u => u.viewedScene && game.scenes.get(u.viewedScene)),
		].filter(Boolean));
		for (const scene of scenes) {
			for (const token of scene.tokens) {
				const actor = token.actor;
				if (actor?.type === "character") actors.set(actor.uuid, actor);
			}
		}
		return [...actors.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	async _checkConditions(worldTime, delta) {
		fallout.debug("Condition Tracker: running checks");

		const skipMissingPlayers = game.settings.get(
			SYSTEM_ID, "conditionsSkipMissingPlayers"
		);

		for (const actor of this.trackedActors()) {
			// Only a player's own character waits for its player.
			if (skipMissingPlayers && actor.hasPlayerOwner && actor.ownerIsOffline) {
				fallout.log(`Condition Tracker: skipping character ${actor.name} as owner is offline`);
				continue;
			}

			fallout.log(`Condition Tracker: checking conditions for character ${actor.name}`);
			try {
				await actor.checkConditions(worldTime, delta);
			}
			catch(err) {
				fallout.error(`Condition Tracker: ${actor.name}`, err);
			}
		}
	}

	onUpdateWorldTime(worldTime, worldDelta) {
		if (this.isDisabled) return;
		// One GM only, so two GMs don't both apply the same hours.
		if (!game.user.isGM || (game.users.activeGM && game.users.activeGM !== game.user)) return;

		const previous = this.lastWorldTime ?? (worldTime - worldDelta);
		const delta = worldTime - previous;

		if (Math.abs(delta) >= this.updateIntervalSecs) {
			this.lastWorldTime = worldTime;
			this._checkConditions(worldTime, delta);
		}
	}
}
