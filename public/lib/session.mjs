// The Longshot Pass session, one for the page: Play's account (app 'odds')
// and the tracked tickets (app 'slip', through q.view('slip')).
import { passSession, detectLang } from '../kit/core.mjs';

export const q = passSession('odds', { lang: detectLang() });
