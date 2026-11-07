import { useEffect, useState } from 'react';
import { BookOpen, Dices, Gamepad2, Rocket, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { create } from 'zustand';
import { Modal } from './ui';

const KEY = 'grimorio-onboarding-v1';

export const useOnboarding = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ }
    set({ open: false });
  },
}));

const STEPS = [
  {
    icon: Rocket,
    title: 'Bem-vindo a bordo',
    text: 'O Grimório é a ficha de D&D da tripulação: calcula tudo sozinho, rola os dados e guarda seus personagens. Primeiro escolha a mesa, **D&D 2014** ou **D&D 2024**, conforme as regras que o seu mestre usa.',
  },
  {
    icon: BookOpen,
    title: 'Seu personagem',
    text: 'Clique em **Novo personagem** e siga os passos (raça, classe, atributos…). Já tem ficha no app **5e Companion**? Use **Importar ficha** e escolha o arquivo **.cah**.',
  },
  {
    icon: Dices,
    title: 'Clique para rolar',
    text: 'Qualquer número da ficha rola o dado: atributos, perícias, salvaguardas, ataques e magias. **VAN** e **DES** valem para a próxima rolagem. O dado redondo no canto abre a bandeja de dados.',
  },
  {
    icon: Users,
    title: 'Jogando com a mesa',
    text: 'Crie uma conta em **Entrar**. O mestre cria a campanha e manda o **link de convite** no Discord; você abre o link e escolhe seu personagem em **Ajustes**. Durante a sessão, fique na aba **Minha ficha**: suas rolagens aparecem para todos.',
  },
  {
    icon: Gamepad2,
    title: 'Modo jogo',
    text: 'Na ficha, o botão **Modo jogo** esconde o que só serve para montar o personagem e deixa só o que se usa na sessão. Para mudar algo, clique em **Editar ficha**. Você pode rever este guia no botão **?** do topo.',
  },
];

export function Onboarding() {
  const { open, show, hide } = useOnboarding();
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) show();
    } catch { /* private mode: skip */ }
  }, [show]);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  if (!open) return null;
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  const html = s.text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  return (
    <Modal title={s.title} icon={<s.icon color="var(--gold)" />} onClose={hide}
      footer={<>
        <button className="btn ghost" onClick={hide}>Pular</button>
        <span className="spacer" />
        <span className="small muted">{i + 1} de {STEPS.length}</span>
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={15} /> Voltar</button>
        <button className="btn primary" onClick={() => (last ? hide() : setI(i + 1))}>{last ? 'Começar' : <>Próximo <ChevronRight size={15} /></>}</button>
      </>}>
      <p className="prose" style={{ fontSize: 18, margin: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
      <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 18 }}>
        {STEPS.map((_, k) => <span key={k} style={{ width: 8, height: 8, borderRadius: '50%', background: k === i ? 'var(--gold)' : 'var(--line-2)' }} />)}
      </div>
    </Modal>
  );
}
