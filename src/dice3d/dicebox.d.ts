declare module '@3d-dice/dice-box-threejs' {
  const DiceBox: new (selector: string, config?: Record<string, unknown>) => unknown;
  export default DiceBox;
}
