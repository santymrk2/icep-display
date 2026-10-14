/**
 * Giro que se aplica a una pantalla.
 * - Giro manual (90/180/270): siempre se aplica (el TV está montado así).
 * - Giro 0 = automático: si la presentación es vertical y la pantalla reporta tamaño horizontal
 *   (o al revés), se gira 90° para que el contenido se vea en la orientación elegida.
 */
export function effectiveRotation(
  device: { rotation: number; screenWidth: number | null; screenHeight: number | null },
  presentationOrientation: "landscape" | "portrait" | null,
): { rotation: number; auto: boolean } {
  if (device.rotation !== 0) return { rotation: device.rotation, auto: false };
  if (!presentationOrientation || !device.screenWidth || !device.screenHeight) return { rotation: 0, auto: false };
  const physical = device.screenWidth >= device.screenHeight ? "landscape" : "portrait";
  return physical !== presentationOrientation ? { rotation: 90, auto: true } : { rotation: 0, auto: false };
}
