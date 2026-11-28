/**
 * The game clock: Foundry's world time (game.time, which combat and other
 * modules also advance) read through Foundry's calendar.
 *
 * While the game is not paused (nor in-game time, the world setting
 * "clockPaused"), game time runs: by default one game minute a
 * real minute, faster by the world setting "timeRate" (a whole number, 1 to
 * MAX_RATE). Only the active GM's client moves the clock, once a game minute
 * (or once a real second when that is sooner). It stands still during a
 * started combat, whose rounds move it on.
 *
 * Moved here from the Foundout module (fo2-maps), which keeps only its day and
 * night darkness, following this time.
 */

/** Where the clock starts in a new world (worldTime 0 is the year 0). */
export const START = { year: 2162, month: 5, day: 28, hour: 7, minute: 0 };

/** Fastest clock: game seconds per real second (one game hour a real second). */
export const MAX_RATE = 3600;

/** Day of the week abbreviations, Sunday first (as Date.getUTCDay counts). */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Weds", "Thu", "Fri", "Sat"];

const cal = () => game.time.calendar;
const pad = n => String(n).padStart(2, "0");

export function registerClockSettings() {
	game.settings.register(SYSTEM_ID, "timeRate", {
		scope: "world", config: false, type: Number, default: 1,
	});
	game.settings.register(SYSTEM_ID, "clockStarted", {
		scope: "world", config: false, type: Boolean, default: false,
	});
	game.settings.register(SYSTEM_ID, "clockPaused", {
		name: "Pause In-game Time",
		hint: "The game clock stands still while the game runs.",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		onChange: () => refreshClockPausedBanner(),
	});
}

/** The clock speed: game seconds per real second, a whole number from 1 to MAX_RATE. */
export const clampRate = n => Math.max(1, Math.min(MAX_RATE, Math.round(Number(n)) || 1));

/** Days in month `m` (0-based) of `year`. */
export function monthDays(year, m) {
	const month = cal().months.values[m];
	return (cal().isLeapYear(year) && month.leapDays) ? month.leapDays : month.days;
}

/** Month names, January first. */
export const monthNames = () => cal().months.values.map(m => game.i18n.localize(m.name));

/** {year, month (0-based), day (1-based), hour, minute} of a world time (seconds). */
export function dateOf(time = game.time.worldTime) {
	const c = cal().timeToComponents(time);
	return { year: c.year, month: c.month, day: c.dayOfMonth + 1, hour: c.hour, minute: c.minute };
}

/** The world time (seconds) of a date. */
export function timeOf({ year, month, day, hour = 0, minute = 0 }) {
	month = Math.max(0, Math.min(11, month));
	day = Math.max(1, Math.min(monthDays(year, month), day));
	let doy = day - 1;
	for (let m = 0; m < month; m++) {
		doy += monthDays(year, m);
	}
	return cal().componentsToTime({ year, day: doy, hour, minute, second: 0 });
}

/** The day of the week, by the real Gregorian calendar (28 June 2162 is a Monday). */
export const weekdayOf = d => WEEKDAYS[new Date(Date.UTC(d.year, d.month, d.day)).getUTCDay()];

/** "Mon 28 June 2162" */
export const formatDay = (d = dateOf()) => `${weekdayOf(d)} ${d.day} ${monthNames()[d.month]} ${d.year}`;

/** "Mon 28 June 2162 - 07:00" */
export const formatDate = (d = dateOf()) => `${formatDay(d)} - ${pad(d.hour)}:${pad(d.minute)}`;

/** The one GM that moves the clock (so two GMs don't both advance it). */
const writer = () => game.user.isGM && (game.users.activeGM ?? game.user) === game.user;

/* --------------------------------- running time ---------------------------------- */

let lastTick = null;
let owed = 0; // game seconds run but not yet added to the world time

function clockRuns() {
	return writer() && !game.paused && !game.combat?.started
		&& !game.settings.get(SYSTEM_ID, "clockPaused");
}

async function tick() {
	const now = performance.now();
	if (!clockRuns()) {
		lastTick = null;
		owed = 0;
		return;
	}
	if (lastTick === null) {
		lastTick = now;
		return;
	}
	const rate = clampRate(game.settings.get(SYSTEM_ID, "timeRate"));
	owed += ((now - lastTick) / 1000) * rate;
	lastTick = now;
	if ((owed < 60) && (rate < 60)) {
		return;
	}
	const seconds = Math.floor(owed);
	if (seconds < 1) {
		return;
	}
	owed -= seconds;
	await game.time.advance(seconds);
}

/* ------------------------------------ display ------------------------------------- */

/** "Mon 28 June 2162  07:00", as the character sheet shows it. */
export const formatSheetDate = (d = dateOf()) => `${formatDay(d)}  ${pad(d.hour)}:${pad(d.minute)}`;

/** Put the date and time on every open classic character sheet. */
export function refreshSheetDates() {
	const text = formatSheetDate();
	for (const el of document.querySelectorAll(".classic-sheet .classic-date")) {
		if (el.textContent !== text) {
			el.textContent = text;
		}
	}
}

/** "In-game time paused" across the top of the screen while in-game time is paused. */
export function refreshClockPausedBanner() {
	let banner = document.getElementById("fallout-clock-paused");
	if (!banner) {
		banner = document.createElement("div");
		banner.id = "fallout-clock-paused";
		banner.textContent = "In-game time paused";
		document.body.append(banner);
	}
	banner.hidden = !game.settings.get(SYSTEM_ID, "clockPaused");
}

/* ------------------------------------- hooks -------------------------------------- */

export function initClock() {
	Hooks.on("updateWorldTime", () => refreshSheetDates());
	Hooks.once("ready", async () => {
		refreshClockPausedBanner();
		// The world clock's first start: a new world starts on the Fallout date,
		// once. An existing world time is left as it is. A world that ran
		// Foundout's clock before carries its speed over.
		if (writer() && !game.settings.get(SYSTEM_ID, "clockStarted")) {
			if (game.time.worldTime === 0) {
				await game.time.set(timeOf(START));
			}
			const oldRate = game.settings.storage.get("world")?.getSetting?.("fo2-maps.timeRate")?.value;
			if (oldRate !== undefined) {
				await game.settings.set(SYSTEM_ID, "timeRate", clampRate(oldRate));
			}
			await game.settings.set(SYSTEM_ID, "clockStarted", true);
		}
		setInterval(() => tick().catch(err => console.warn(`${SYSTEM_ID} | clock`, err)), 1000);
	});
}
