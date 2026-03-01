import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { KH } from '../config';
import { apiFetchOAuthGoogle, apiFetchOAuthFacebook } from '../api/oauthApi';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle() {
  if (!KH.GOOGLE_CLIENT_ID) {
    return { implemented: false, provider: 'google', message: 'GOOGLE_CLIENT_ID not set in mobile/src/config.js' };
  }

  const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth'
    + `?client_id=${encodeURIComponent(KH.GOOGLE_CLIENT_ID)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + '&response_type=token'
    + '&scope=openid%20email%20profile'
    + '&prompt=select_account';

  const res = await AuthSession.startAsync({ authUrl });
  if (res.type !== 'success') return { implemented: false, provider: 'google', cancelled: true };

  const accessToken = res.params && res.params.access_token;
  if (!accessToken) return { implemented: false, provider: 'google', message: 'No access_token returned' };

  return apiFetchOAuthGoogle({ accessToken });
}

export async function signInWithFacebook() {
  if (!KH.FACEBOOK_APP_ID) {
    return { implemented: false, provider: 'facebook', message: 'FACEBOOK_APP_ID not set in mobile/src/config.js' };
  }

  const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
  const authUrl =
    'https://www.facebook.com/v18.0/dialog/oauth'
    + `?client_id=${encodeURIComponent(KH.FACEBOOK_APP_ID)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + '&response_type=token'
    + '&scope=email,public_profile';

  const res = await AuthSession.startAsync({ authUrl });
  if (res.type !== 'success') return { implemented: false, provider: 'facebook', cancelled: true };

  const accessToken = res.params && res.params.access_token;
  if (!accessToken) return { implemented: false, provider: 'facebook', message: 'No access_token returned' };

  return apiFetchOAuthFacebook({ accessToken });
}
