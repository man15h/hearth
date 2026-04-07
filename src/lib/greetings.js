const WEATHER_GREETINGS = {
	rain: ["Rainy day — stay cozy", "Grab an umbrella"],
	snow: ["It's a snow day", "Bundle up out there"],
	storm: ["Stormy skies today"],
	hot: ["It's scorching out there"],
	cold: ["Chilly but clear"],
	clear: ["Beautiful day out there"]
};

const DAY_GREETINGS = {
	1: ["Start of a new week"],
	5: ["Happy Friday", "TGIF"],
	0: ["Enjoy your weekend"],
	6: ["Enjoy your weekend"]
};

const NIGHT_GREETINGS = ["Burning the midnight oil?", "Night owl mode"];
const EARLY_GREETINGS = ["You're up early!"];

const TIME_POOLS = {
	morning: ["Good morning", "Rise and shine", "Top of the morning"],
	afternoon: ["Good afternoon", "Hope your day's going well"],
	evening: ["Good evening", "Welcome back"]
};

function stablePick(arr, seed) {
	return arr[seed % arr.length];
}

/**
 * Returns a contextual greeting that stays stable within the same day.
 * Priority: weather → day-of-week → time-of-day context → rotating pool.
 */
export function getGreeting(name, weatherCode, temp) {
	const now = new Date();
	const h = now.getHours();
	const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
	const seed = dayOfYear + (name?.length || 0);

	let greeting;

	// Weather-aware (highest priority, but skip "clear" greetings at night)
	if (weatherCode != null && temp != null) {
		if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode)) {
			greeting = stablePick(WEATHER_GREETINGS.rain, seed);
		} else if ([71, 73, 75].includes(weatherCode)) {
			greeting = stablePick(WEATHER_GREETINGS.snow, seed);
		} else if ([95, 96, 99].includes(weatherCode)) {
			greeting = stablePick(WEATHER_GREETINGS.storm, seed);
		} else if (weatherCode === 0 && temp > 35) {
			greeting = stablePick(WEATHER_GREETINGS.hot, seed);
		} else if (weatherCode === 0 && temp < 10) {
			greeting = stablePick(WEATHER_GREETINGS.cold, seed);
		} else if (weatherCode === 0 && h >= 7 && h < 21) {
			greeting = stablePick(WEATHER_GREETINGS.clear, seed);
		}
	}

	// Day-aware (~30% chance, second priority)
	if (!greeting) {
		const dow = now.getDay();
		const dayPool = DAY_GREETINGS[dow];
		if (dayPool && seed % 10 < 3) {
			greeting = stablePick(dayPool, seed);
		}
	}

	// Contextual time (third priority)
	if (!greeting) {
		if (h >= 21 || h < 5) {
			greeting = stablePick(NIGHT_GREETINGS, seed);
		} else if (h >= 5 && h < 7) {
			greeting = stablePick(EARLY_GREETINGS, seed);
		}
	}

	// Rotating pool (fallback)
	if (!greeting) {
		let pool;
		if (h >= 5 && h < 12) pool = TIME_POOLS.morning;
		else if (h >= 12 && h < 17) pool = TIME_POOLS.afternoon;
		else pool = TIME_POOLS.evening;
		greeting = stablePick(pool, seed);
	}

	return greeting + ', ' + (name || 'friend') + '!';
}
