// Página que corre DENTRO del WebView oculto: carga face-api, arma los modelos con los pesos que le manda la app
// (empaquetados en los assets, así funciona sin internet) y calcula el vector facial (128 números) de una foto.
// La foto nunca sale del dispositivo ni se guarda: solo se devuelve el vector.

// Misma calidad mínima que en la web (app-corbana/lib/faceDescriptor.js).
export const paginaFacial = (motorJs: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body>
<script>
window.onerror = function (msg, src, line) { window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'error', mensaje: 'Error en el motor facial: ' + msg + (line ? ' (línea ' + line + ')' : '') })); };
window.addEventListener('unhandledrejection', function (e) { window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'error', mensaje: 'Error en el motor facial: ' + (e.reason && e.reason.message ? e.reason.message : e.reason) })); });
</script>
<script>${motorJs}</script>
<script>
(function () {
  var faceapi = window.faceapi;
  if (!faceapi) { enviarError('No se pudo iniciar face-api en este dispositivo'); return; }
  var buffers = {};
  var manifiestos = {};
  var listo = false;
  var pesos = {};

  function enviarError(m) { window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'error', mensaje: m })); }
  function enviar(obj) { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }

  function base64AArrayBuffer(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // Carga los modelos en el backend pedido. webgl (GPU) es mucho más rápido; en algunos celulares da resultados erróneos
  // por la precisión de la GPU, y entonces se vuelve a cpu (más lento pero fiable). Los pesos se conservan para poder recargar.
  async function cargarModelos(backend) {
    if (backend === 'webgl') faceapi.tf.env().set('WEBGL_FORCE_F16_TEXTURES', false);
    await faceapi.tf.setBackend(backend);
    await faceapi.tf.ready();
    var nets = { tiny: faceapi.nets.tinyFaceDetector, landmark: faceapi.nets.faceLandmark68Net, recog: faceapi.nets.faceRecognitionNet };
    for (var k in nets) {
      var specs = manifiestos[k][0].weights;
      var mapa = faceapi.tf.io.decodeWeights(pesos[k] || (pesos[k] = base64AArrayBuffer(buffers[k].join(''))), specs);
      await nets[k].loadFromWeightMap(mapa);
    }
    listo = true;
    enviar({ t: 'listo', backend: faceapi.tf.getBackend() });
  }

  function rotar(origen, grados) {
    var c = document.createElement('canvas');
    var lado = grados === 180;
    c.width = lado ? origen.width : origen.height;
    c.height = lado ? origen.height : origen.width;
    var ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((grados * Math.PI) / 180);
    ctx.drawImage(origen, -origen.width / 2, -origen.height / 2);
    return c;
  }

  function cargarImagen(b64) {
    return new Promise(function (ok, fallo) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { fallo(new Error('No se pudo leer la foto')); };
      img.src = 'data:image/jpeg;base64,' + b64;
    });
  }

  async function descriptor(id, b64) {
    try {
      if (!listo) throw new Error('El motor facial aún se está preparando');
      var img = await cargarImagen(b64);
      // Se reduce a 640 px de lado mayor: más rápido y suficiente para reconocer.
      var escala = Math.min(1, 640 / Math.max(img.width, img.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      // Algunas cámaras guardan la foto girada (orientación EXIF): si no se ve ninguna cara, se prueba girada 90, 270 y 180 grados.
      async function buscar() {
        var res = [];
        var u = canvas;
        var giros = [0, 90, 270, 180];
        for (var g = 0; g < giros.length && res.length === 0; g++) {
          u = giros[g] === 0 ? canvas : rotar(canvas, giros[g]);
          res = await faceapi.detectAllFaces(u, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptors();
        }
        return { det: res, usado: u };
      }
      var t0 = Date.now();
      var r = await buscar();
      if ((r.det.length === 0 || r.det[0].detection.score < 0.5) && faceapi.tf.getBackend() === 'webgl') {
        // La GPU de este celular no sirve para el reconocimiento: se cambia a cpu y se reintenta.
        listo = false;
        await cargarModelos('cpu');
        r = await buscar();
      }
      var det = r.det;
      var usado = r.usado;
      canvas = usado;
      if (det.length === 0) {
        // Diagnóstico: motor, tamaño y brillo medio de la imagen que se analizó (detecta imagen en blanco o motor mal iniciado).
        var mini = document.createElement('canvas'); mini.width = 16; mini.height = 16;
        var mctx = mini.getContext('2d'); mctx.drawImage(canvas, 0, 0, 16, 16);
        var px = mctx.getImageData(0, 0, 16, 16).data, suma = 0;
        for (var q = 0; q < px.length; q += 4) suma += (px[q] + px[q + 1] + px[q + 2]) / 3;
        var crudo = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.05 }));
        throw new Error('No se detecta ninguna cara (foto ' + img.width + 'x' + img.height + ', motor ' + faceapi.tf.getBackend() + ', brillo ' + Math.round(suma / 256) + ', ' + (Date.now() - t0) + ' ms' + ', candidatos ' + crudo.length + (crudo[0] ? ' mejor ' + crudo[0].score.toFixed(2) : '') + ').');
      }
      if (det.length > 1) throw new Error('Se detectan varias caras. Debe verse una sola persona.');
      var d = det[0];
      if (d.detection.score < 0.5) throw new Error('La cara no se ve con claridad. Mejora la luz y mira de frente.');
      if (d.detection.box.width / canvas.width < 0.18) throw new Error('La cara se ve muy lejos. Acércate a la cámara.');
      enviar({ t: 'resultado', id: id, descriptor: Array.from(d.descriptor), confianza: d.detection.score, ms: Date.now() - t0, backend: faceapi.tf.getBackend() });
    } catch (e) {
      enviar({ t: 'resultado', id: id, error: e && e.message ? e.message : 'Error al procesar la foto' });
    }
  }

  // Mensajes desde la app: manifiestos, pesos (por partes) y fotos.
  window.__rn = function (m) {
    if (m.t === 'manifiesto') { manifiestos[m.nombre] = m.datos; }
    else if (m.t === 'parte') { (buffers[m.nombre] = buffers[m.nombre] || []).push(m.datos); }
    else if (m.t === 'cargar') { cargarModelos('webgl').catch(function () { return cargarModelos('cpu'); }).catch(function (e) { enviar({ t: 'error', mensaje: e.message }); }); }
    else if (m.t === 'foto') { descriptor(m.id, m.datos); }
  };
  enviar({ t: 'pagina' });
})();
</script>
</body></html>`;
