import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

// Registro del motor facial: el componente <FaceEngine /> (WebView oculto) se registra aquí y el resto de la app pide
// el vector de una foto con `obtenerDescriptor`. Los modelos van empaquetados en la app (funciona sin internet).

/* eslint-disable @typescript-eslint/no-require-imports */
export const ASSETS_FACIALES = {
  motor: require('../../assets/face/face-api.html') as number,
  pesos: {
    tiny: require('../../assets/face/tiny_face_detector_model.bin') as number,
    landmark: require('../../assets/face/face_landmark_68_model.bin') as number,
    recog: require('../../assets/face/face_recognition_model.bin') as number,
  },
  manifiestos: {
    tiny: require('../../assets/face/tiny_face_detector_model-weights_manifest.json'),
    landmark: require('../../assets/face/face_landmark_68_model-weights_manifest.json'),
    recog: require('../../assets/face/face_recognition_model-weights_manifest.json'),
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */

export const leerAsset = async (modulo: number, encoding: 'utf8' | 'base64'): Promise<string> => {
  const asset = Asset.fromModule(modulo);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return FileSystem.readAsStringAsync(uri, { encoding: encoding === 'utf8' ? FileSystem.EncodingType.UTF8 : FileSystem.EncodingType.Base64 });
};

interface EstadoMotor {
  estado: 'inactivo' | 'cargando' | 'listo' | 'error';
  mensaje: string;
  set: (estado: EstadoMotor['estado'], mensaje?: string) => void;
}

export const useMotorFacial = create<EstadoMotor>((set) => ({
  estado: 'inactivo',
  mensaje: '',
  set: (estado, mensaje = '') => set({ estado, mensaje }),
}));

export interface ResultadoFacial {
  descriptor: number[];
  confianza: number;
  /** Diagnóstico: motor usado (webgl/cpu) y milisegundos que tardó el análisis. */
  backend?: string;
  ms?: number;
}

type Pendiente = { ok: (r: ResultadoFacial) => void; fallo: (e: Error) => void };
const pendientes = new Map<string, Pendiente>();
let enviarAlWebView: ((mensaje: object) => void) | null = null;
let contador = 0;

export const registrarEnvio = (fn: ((mensaje: object) => void) | null) => {
  enviarAlWebView = fn;
};

export const resolverResultado = (id: string, r: { descriptor?: number[]; confianza?: number; error?: string; backend?: string; ms?: number }) => {
  const p = pendientes.get(id);
  if (!p) return;
  pendientes.delete(id);
  if (r.error || !r.descriptor) p.fallo(new Error(r.error ?? 'No se pudo calcular el rostro'));
  else p.ok({ descriptor: r.descriptor, confianza: r.confianza ?? 0, backend: r.backend, ms: r.ms });
};

const esperarListo = async (ms: number) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    const { estado, mensaje } = useMotorFacial.getState();
    if (estado === 'listo') return;
    if (estado === 'error') throw new Error(mensaje || 'El motor facial no pudo iniciar');
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('El motor facial está tardando en iniciar. Intenta de nuevo en un momento.');
};

/** Calcula el vector facial (128 números) de una foto en base64 (JPEG). La foto no se guarda. */
export const obtenerDescriptor = async (fotoBase64: string): Promise<ResultadoFacial> => {
  await esperarListo(90000);
  if (!enviarAlWebView) throw new Error('El motor facial no está disponible');
  contador += 1;
  const id = `f${Date.now()}-${contador}`;
  return new Promise<ResultadoFacial>((ok, fallo) => {
    pendientes.set(id, { ok, fallo });
    enviarAlWebView?.({ t: 'foto', id, datos: fotoBase64 });
    setTimeout(() => {
      if (pendientes.delete(id)) fallo(new Error('El reconocimiento tardó demasiado. Intenta de nuevo.'));
    }, 60000);
  });
};
