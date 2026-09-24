/**
 * garminSync.ts
 * Handles Garmin Connect Developer Program OAuth and activity data sync.
 *
 * STATUS (2026-09-13): Garmin's Developer Program is business-use-only and
 * requires an approved application (developer.garmin.com/gc-developer-program)
 * before any of this can actually run. Their FAQ confirms the program uses
 * OAuth 2.0 — a prior version of this file incorrectly assumed OAuth 1.0a.
 * Garmin does not publish exact endpoint URLs/scopes publicly; those live in
 * their gated developer portal docs, only visible after approval. The
 * endpoint constants below are our best-guess placeholders based on Garmin's
 * public naming conventions — CONFIRM AND REPLACE THEM against the real
 * portal docs once you have access, before relying on this for real.
 *
 * SETUP REQUIRED (one-time, once approved):
 * 1. Get your Client ID (and Client Secret, if Garmin's token exchange
 *    requires one — see the note on PKCE below) from the Garmin Developer
 *    Portal.
 * 2. Store the Client ID in settingsStore/SecureStore (see setGarminClientId
 *    below) — do NOT hardcode it in source.
 * 3. If Garmin's token exchange requires a client secret: a secret cannot
 *    live safely inside a distributed mobile app (same problem as the
 *    ElevenLabs key — anyone can extract it from the app bundle). That would
 *    mean adding a small backend relay to keep the secret server-side. Public
 *    OAuth 2.0 clients (mobile apps) normally avoid this entirely via PKCE,
 *    which this flow uses — but confirm which model Garmin's portal actually
 *    documents before assuming PKCE-only is sufficient.
 *
 * Flow: OAuth 2.0 Authorization Code + PKCE via expo-auth-session, using the
 * app's own URL scheme (see app.json "scheme") as the redirect target.
 */
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { saveGarminToken, getGarminToken } from '../store/workoutStore';

// ⚠️ PLACEHOLDERS — not confirmed against Garmin's real API reference.
// Update these from the Garmin Developer Portal once your application is
// approved and you can see the actual docs.
const GARMIN_AUTHORIZATION_ENDPOINT = 'https://connect.garmin.com/oauth2Confirm';
const GARMIN_TOKEN_ENDPOINT = 'https://connectapi.garmin.com/oauth-service/oauth/token';
const GARMIN_API_BASE = 'https://apis.garmin.com';

const CLIENT_ID_KEY = 'forge_garmin_client_id';

export async function setGarminClientId(clientId: string): Promise<void> {
  if (clientId) await SecureStore.setItemAsync(CLIENT_ID_KEY, clientId);
  else await SecureStore.deleteItemAsync(CLIENT_ID_KEY);
}

export async function getGarminClientId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CLIENT_ID_KEY);
  } catch {
    return null;
  }
}

export interface GarminActivity {
  activityId: string;
  startTimeLocal: string;
  duration: number; // seconds
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
 * Runs the OAuth 2.0 + PKCE authorization flow: opens Garmin's consent
 * screen in the system browser, waits for the redirect back into this app
 * (via the "forge54://" scheme), and exchanges the returned code for an
 * access token.
 *
 * Returns true if the user completed authorization and a token was saved.
 */
export async function connectGarminAccount(): Promise<boolean> {
  const clientId = await getGarminClientId();
  if (!clientId) {
    console.warn('No Garmin client ID configured — set one in Settings first.');
    return false;
  }

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'forge54' });

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    scopes: [], // TODO: fill in once Garmin's portal docs list actual scope names
  });

  const discovery = {
    authorizationEndpoint: GARMIN_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: GARMIN_TOKEN_ENDPOINT,
  };

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) return false;

  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    },
    discovery
  );

  if (!tokenResult.accessToken) return false;
  await saveGarminToken(tokenResult.accessToken);
  return true;
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
    const url = `${GARMIN_API_BASE}/wellness-api/rest/activities?` +
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
