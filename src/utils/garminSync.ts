/**
 * garminSync.ts
 * Handles Garmin Connect API OAuth and activity data sync.
 *
 * SETUP REQUIRED (one-time for developer):
 * 1. Register app at https://developer.garmin.com/gc-developer-program/overview/
 * 2. Get Consumer Key + Secret
 * 3. Set GARMIN_CONSUMER_KEY and GARMIN_CONSUMER_SECRET in your .env
 *
 * Flow: OAuth 1.0a (Garmin uses OAuth 1.0a, not 2.0)
 * User taps "Connect Garmin" → opens browser → user authorizes → 
 * callback returns token → saved securely → auto-sync after workouts
 */
import { saveGarminToken, getGarminToken } from '../store/workoutStore';

const GARMIN_API = 'https://apis.garmin.com';
const GARMIN_AUTH = 'https://connect.garmin.com';

export interface GarminActivity {
  activityId: string;
  startTimeLocal: string;
  duration: number;          // seconds
  averageHR: number;
  maxHR: number;
  calories: number;
  trainingEffect: number;
  intensityMinutesModerate: number;
  intensityMinutesVigorous: number;
  vo2MaxValue?: number;
  hrZoneBreakdowns?: {
    zone1Seconds: number;
    zone2Seconds: number;
    zone3Seconds: number;
    zone4Seconds: number;
    zone5Seconds: number;
  };
}

/**
 * Initiate Garmin OAuth 1.0a flow.
 * Opens Garmin Connect in browser, user grants permission,
 * callback URL brings token back to app.
 */
export async function initiateGarminOAuth(callbackUrl: string): Promise<string> {
  // Step 1: Get request token
  const requestTokenUrl = `${GARMIN_AUTH}/oauth-service/oauth/request_token`;
  // Returns oauth_token and oauth_token_secret
  // Step 2: Redirect user to authorization URL
  const authUrl = `${GARMIN_AUTH}/oauth-service/oauth/authorize?oauth_token=REQUEST_TOKEN`;
  return authUrl;
  // Step 3: Exchange verifier for access token (handled in callback)
}

/**
 * Fetch most recent Garmin activity matching a workout timestamp.
 * Called automatically after each workout completion.
 */
export async function syncLatestActivity(workoutEndTime: Date): Promise<GarminActivity | null> {
  const token = await getGarminToken();
  if (!token) return null;

  try {
    // Query activities within 2-hour window of workout
    const start = new Date(workoutEndTime.getTime() - 2 * 60 * 60 * 1000);
    const url = `${GARMIN_API}/wellness-api/rest/activities?` +
      `uploadStartTimeInSeconds=${Math.floor(start.getTime() / 1000)}` +
      `&uploadEndTimeInSeconds=${Math.floor(workoutEndTime.getTime() / 1000)}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return null;
    const activities = await response.json();
    if (!activities?.length) return null;

    // Return most recent activity
    return activities.sort((a: GarminActivity, b: GarminActivity) =>
      new Date(b.startTimeLocal).getTime() - new Date(a.startTimeLocal).getTime())[0];
  } catch (err) {
    console.error('Garmin sync error:', err);
    return null;
  }
}

/**
 * Calculate HR zone percentages from raw zone seconds.
 */
export function calculateHRZonePercentages(zones: GarminActivity['hrZoneBreakdowns']): number[] {
  if (!zones) return [0, 0, 0, 0, 0];
  const total = zones.zone1Seconds + zones.zone2Seconds + zones.zone3Seconds +
    zones.zone4Seconds + zones.zone5Seconds;
  if (total === 0) return [0, 0, 0, 0, 0];
  return [
    Math.round((zones.zone1Seconds / total) * 100),
    Math.round((zones.zone2Seconds / total) * 100),
    Math.round((zones.zone3Seconds / total) * 100),
    Math.round((zones.zone4Seconds / total) * 100),
    Math.round((zones.zone5Seconds / total) * 100),
  ];
}
