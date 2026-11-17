# Chocorocks

Página de pedidos de Chocorocks: pastelería a pedido, retiro en Belgrano, pedidos por WhatsApp.

La página no tiene precios ni productos escritos en el código. **Todo sale del Google Sheet**, de la hoja **"Catálogo web"**, que está publicada como CSV. Cada vez que alguien abre la página, lee el Sheet.

## Cambiar precios o productos

Siempre en el Sheet, nunca en el código.

- **Precios:** se calculan solos en la hoja "Ajustes web" a partir de los costos de la hoja Tortas, y se redondean hacia arriba de a $500. Para que un precio se actualice, cargá la compra en **Gastos** como siempre.
- **Mostrar u ocultar un producto:** en "Ajustes web", columna **"Mostrar en la web"**: `sí` o `no`. En las tortas, la fila de 26 cm manda también sobre la de 22 cm.
- **Un producto aparece como no disponible:** le falta algún dato (precio de un ingrediente, molde de la receta). Mirá la columna "Datos faltantes" en "Ajustes web".
- **Favoritas ("Para empezar"):** salen de la hoja **Ventas** (lo más vendido en los últimos 90 días) y de las celdas amarillas "Fijar arriba".

Los cambios se ven en la página en unos minutos, que es lo que tarda Google en volver a publicar el CSV.

## Subir el multiplicador

En la hoja **"Ajustes web"**, celda **B5** (amarilla). Hoy está en 3. Si lo pasás a 3,2, todos los precios suben y se vuelven a redondear de a $500. No hay que tocar nada más.

En la misma hoja están las otras celdas amarillas: packaging, altura de referencia de las tortas, ml de jugo por limón y el molde de las recetas que no lo tienen cargado en Tortas.

## Fotos

- Los archivos están en la carpeta `fotos/` (JPG livianos, de unos 100 KB).
- Qué foto va con cada producto se decide en el Sheet: hoja **"Ajustes web"**, tabla amarilla **"FOTOS WEB"** (abajo de todo): nombre del producto → nombre del archivo. La columna "Foto" de "Catálogo web" la toma de ahí sola.
- **Destacadas (arriba, en tarjeta con foto):** las de "Fijar arriba" en la hoja **Ventas** (hasta 6), más las más vendidas. El resto se muestra en lista compacta.
- **Portada:** `fotos/portada.jpg`. **Vista previa al compartir el link:** `fotos/compartir.jpg`. **Ícono:** `favicon-32.png` e `icono-180.png`.
- Todas las fotos originales están clasificadas en la carpeta "CR by Chocorocks" (`clasificacion.csv` y `_clasificadas/`).

## Otros datos de la página

En `app.js`, arriba de todo (`CONFIG`): número de WhatsApp, link de Instagram y horarios de retiro.

## Copia de respaldo

`catalogo-respaldo.js` es una copia del catálogo que se muestra al instante mientras responde el Sheet, y que se usa si Google no responde. GitHub la actualiza sola todos los días (`.github/workflows/actualizar-respaldo.yml`). Para actualizarla a mano:

```
python scripts/actualizar_respaldo.py
```
