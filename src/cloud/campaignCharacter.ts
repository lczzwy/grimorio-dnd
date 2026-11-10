import { useApp } from '../store';
import { setMyCharacter } from './campaigns';
import { uploader } from './sync';

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
}
