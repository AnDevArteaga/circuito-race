# Circuito Lunar

Carrera de karts para TikTok LIVE con pista vertical 9:16, controles para el anfitrión y clasificador en tiempo real. El juego funciona de forma local y la pista tiene arte original.

## Arranque en Windows

1. Instala [Node.js LTS](https://nodejs.org/) en versión 22 o superior.
2. Extrae todo el ZIP en una carpeta. Ejecuta `Iniciar.cmd` y deja esa ventana abierta. También puedes ejecutar `npm start` dentro de la carpeta del proyecto. El juego no requiere `npm install`.
3. Abre [el panel del anfitrión](http://127.0.0.1:8765/) y conserva esta pestaña para controlar la carrera.
4. Usa [la vista del directo](http://127.0.0.1:8765/live) como fuente de la transmisión. Las dos vistas muestran la misma ronda.

En macOS y Linux, la demo se puede abrir con `npm start` desde la carpeta. La conexión local de TikFinity de esta guía usa su app de Windows.

## Prueba sin emitir

1. Mantén seleccionado **Demo**. Verás ocho pilotos de muestra.
2. Añade un invitado si quieres. Pulsa **Iniciar carrera** y espera la cuenta regresiva.
3. Selecciona tu piloto en el simulador y pulsa **Turbo** y **Regalo**. Comprueba la aceleración y los avisos en la vista del directo.
4. Prueba **Pausar**, **Reanudar** y **Nueva ronda**. Comprueba que el reloj y la clasificación se sincronizan en ambas pestañas.

## Prueba con tu TikTok LIVE

1. En el mismo PC, instala [TikFinity Desktop](https://tikfinity.zerody.one/) para Windows, crea una cuenta gratuita y configura el usuario **@** de tu TikTok. Su [API de eventos](https://tikfinity.zerody.one/tiktok/dapi) usa el puerto local 21213.
2. Prepara una escena vertical en **TikTok LIVE Studio**. Añade la fuente **Enlace** con `http://127.0.0.1:8765/live` si está disponible. Si LIVE Studio no carga el enlace local, abre esa dirección en un navegador y captura la ventana con su fuente de captura. En **OBS**, usa una [fuente de navegador](https://obsproject.com/kb/browser-source) con esa dirección y configura la escena y la fuente a 1080 × 1920. Para emitir con OBS directamente, tu cuenta necesita acceso a la URL y clave de transmisión de TikTok.
3. En el panel del juego, elige **TikTok LIVE** con la ronda en parrilla o finalizada. **TikFinity conectado** indica que el juego está conectado a la app local. Inicia el LIVE y conecta TikFinity a tu directo. El panel mostrará la hora del último evento que reciba del LIVE.
4. Pide a alguien que entre desde otra cuenta y escriba **yo**. Su kart debe aparecer en la parrilla y en la vista de transmisión. Inicia la carrera desde el panel.
5. Pídele que escriba **turbo** durante la carrera. Verás una estela y un aviso. Si deseas comprobar un regalo real, ese piloto puede enviar una **Rosa** con la carrera en marcha. Si el regalo admite combos, el efecto aparece cuando el combo termina.
6. Al terminar aparece el ganador. Pulsa **Nueva ronda** para conservar a los participantes y dar prioridad a la cola, o **Vaciar parrilla y cola** para empezar con una lista nueva.

## Reglas y recuperación

- El panel permite cambiar las vueltas, el tiempo máximo, el cupo, ambos comandos y los efectos de regalos mientras la parrilla está abierta. Puedes participar gratis escribiendo el comando de entrada.
- Los karts avanzan solos. Gana quien termina antes las vueltas configuradas. Si se agota el tiempo, gana quien vaya más adelante. Quien se inscriba después de la salida queda en espera para la siguiente ronda.
- El turbo del chat tiene 8 segundos de espera entre usos. Los regalos de un piloto inscrito pueden darle varios segundos de turbo. Un regalo de alguien que aún no corre se registra en el panel.
- Si falta la conexión, revisa que TikFinity Desktop siga abierto y conectado al LIVE. El juego mantiene la ronda y reintenta automáticamente. **Volver a conectar** fuerza un intento inmediato.
- Si el puente aparece conectado pero **yo** no inscribe al piloto, revisa que TikFinity esté recibiendo comentarios del LIVE y que la parrilla esté abierta. Mira también si cambiaste el comando en **Reglas de la ronda**.
- El estado de la partida vive en el proceso local. Puedes recargar cualquiera de las vistas durante la carrera. Cerrar el proceso reinicia la sesión y sus reglas.

## Verificación

Ejecuta `npm test` para comprobar inscripción, cola, turbos, combos de regalos y cierre por vueltas o tiempo.
