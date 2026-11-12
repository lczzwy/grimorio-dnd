import { useApp } from '../store';
import { setMyCharacter } from './campaigns';
import { uploader } from './sync';
import { migratePortraits } from './portraits';

/**
 * Puts one of your characters in play in a campaign (or takes it out with null).
 * The campaign reads the online copy, so the sheet is sent to the account first.
 */
export async function bringCharacter(campaignId: string, characterId: string | null) {
  if (characterId) {
    const c = useApp.getState().characters.find((x) => x.id === characterId);
    if (!c) throw new Error('Personagem não encontrado neste aparelho.');
    if (!c.cloud) useApp.getState().updateCharacter(c.id, (d) => (d.cloud = true));
    uploader.schedule({ ...useApp.getState().characters.find((x) => x.id === characterId)!, cloud: true });
    await uploader.flush();
  }
  await setMyCharacter(campaignId, characterId);
  // a picture still inside the sheet goes to the photo storage, so every save stays small
  void migratePortraits();
}
