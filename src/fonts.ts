// Polices embarquées (OFL), réduites au jeu latin et sans crénage :
// la mise en page à l'écran et dans le PDF est ainsi strictement identique.
import latoRegular from './fonts/Lato-Regular.ttf?url';
import latoBold from './fonts/Lato-Bold.ttf?url';
import montserratRegular from './fonts/Montserrat-Regular.ttf?url';
import montserratBold from './fonts/Montserrat-Bold.ttf?url';
import arimaRegular from './fonts/Arima-Regular.ttf?url';
import arimaBold from './fonts/Arima-Bold.ttf?url';
import dmSerifRegular from './fonts/DMSerifDisplay-Regular.ttf?url';
import poppinsRegular from './fonts/Poppins-Regular.ttf?url';
import poppinsSemiBold from './fonts/Poppins-SemiBold.ttf?url';

export const FONTS = {
  Lato: { 400: latoRegular, 700: latoBold },
  Montserrat: { 400: montserratRegular, 700: montserratBold },
  Arima: { 400: arimaRegular, 700: arimaBold },
  // Police d'affichage à graisse unique : le « gras » utilise le même fichier (jamais de faux gras).
  'DM Serif Display': { 400: dmSerifRegular, 700: dmSerifRegular },
  Poppins: { 400: poppinsRegular, 700: poppinsSemiBold },
} as const;

export type FontFamily = keyof typeof FONTS;
export const FONT_FAMILIES = Object.keys(FONTS) as FontFamily[];
export const DEFAULT_FONT: FontFamily = 'Lato';

export const isFontFamily = (f: unknown): f is FontFamily =>
  typeof f === 'string' && Object.hasOwn(FONTS, f);

export const isBold = (weight: unknown) =>
  weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;

/** URL du fichier TTF utilisé pour l'export PDF. */
export function fontUrl(family: unknown, weight: unknown): string {
  const f = isFontFamily(family) ? FONTS[family] : FONTS[DEFAULT_FONT];
  return isBold(weight) ? f[700] : f[400];
}

/** Attend que toutes les polices d'affichage soient prêtes (mesures de texte exactes). */
export function loadFonts(): Promise<unknown> {
  return Promise.all(
    FONT_FAMILIES.flatMap((fam) =>
      ['400', '700'].map((w) => document.fonts.load(`${w} 16px "${fam}"`)),
    ),
  );
}
