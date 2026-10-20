export const framingEnglish={photoFraming:'Photo framing',fillCrop:'Crop to fill',fitWidth:'Fit width',fitHeight:'Fit height',fitHint:'Keep the whole photo in proportion. If the other side exceeds the screen, scale down to fit.',exportSize:'Export size'} as const;
type Key=keyof typeof framingEnglish;
const rows:Record<string,string>={
  'zh-CN':`照片适配|填满裁剪|宽度适配|高度适配|保留完整照片并保持比例；若另一边超出屏幕上限，将继续等比缩小。|实际导出`,
  'zh-TW':`照片適配|填滿裁剪|寬度適配|高度適配|保留完整照片並保持比例；若另一邊超出螢幕上限，將繼續等比縮小。|實際匯出`,
  ja:`写真の表示|画面いっぱいに切り抜く|幅に合わせる|高さに合わせる|縦横比を保ち、写真全体を表示します。もう一方の辺が画面を超える場合は、さらに縮小します。|書き出しサイズ`,
  de:`Fotoanpassung|Füllend zuschneiden|An Breite anpassen|An Höhe anpassen|Das ganze Foto bleibt proportional erhalten. Überschreitet die andere Seite den Bildschirm, wird es weiter verkleinert.|Exportgröße`,
  th:`การจัดภาพ|ครอบตัดให้เต็ม|พอดีกับความกว้าง|พอดีกับความสูง|แสดงภาพทั้งภาพโดยคงสัดส่วน หากอีกด้านเกินขนาดหน้าจอ จะย่อให้พอดี|ขนาดที่ส่งออก`,
  ru:`Размещение фото|Обрезать по экрану|По ширине|По высоте|Сохранить всё фото и его пропорции. Если другая сторона превышает размер экрана, изображение будет уменьшено.|Размер экспорта`,
  ko:`사진 맞춤|화면에 맞게 자르기|너비 맞춤|높이 맞춤|비율을 유지하여 사진 전체를 표시합니다. 다른 쪽이 화면 크기를 넘으면 더 작게 조정합니다.|내보내기 크기`,
  vi:`Căn ảnh|Cắt đầy khung|Vừa chiều rộng|Vừa chiều cao|Giữ toàn bộ ảnh và đúng tỷ lệ. Nếu cạnh còn lại vượt quá màn hình, ảnh sẽ được thu nhỏ thêm.|Kích thước xuất`,
  fr:`Cadrage de la photo|Recadrer pour remplir|Adapter à la largeur|Adapter à la hauteur|Conserver toute la photo et ses proportions. Si l’autre côté dépasse l’écran, réduire davantage l’image.|Taille exportée`,
  tr:`Fotoğraf yerleşimi|Doldurmak için kırp|Genişliğe sığdır|Yüksekliğe sığdır|Fotoğrafın tamamını ve oranını korur. Diğer kenar ekranı aşarsa fotoğraf daha da küçültülür.|Dışa aktarma boyutu`,
  es:`Encuadre de foto|Recortar para llenar|Ajustar al ancho|Ajustar al alto|Conserva toda la foto y sus proporciones. Si el otro lado supera la pantalla, la imagen se reduce más.|Tamaño de exportación`,
  pt:`Enquadramento da foto|Recortar para preencher|Ajustar à largura|Ajustar à altura|Mantém a foto inteira e suas proporções. Se o outro lado ultrapassar a tela, a imagem será reduzida mais.|Tamanho de exportação`,
  id:`Penyesuaian foto|Pangkas hingga penuh|Sesuaikan lebar|Sesuaikan tinggi|Pertahankan seluruh foto dan proporsinya. Jika sisi lainnya melebihi layar, foto akan diperkecil lagi.|Ukuran ekspor`,
  it:`Inquadratura foto|Ritaglia per riempire|Adatta alla larghezza|Adatta all’altezza|Mantiene l’intera foto e le proporzioni. Se l’altro lato supera lo schermo, l’immagine viene ulteriormente ridotta.|Dimensioni di esportazione`,
  uk:`Розміщення фото|Обрізати до екрана|За шириною|За висотою|Зберегти все фото та його пропорції. Якщо інша сторона перевищує розмір екрана, зображення буде додатково зменшено.|Розмір експорту`,
  sv:`Fotoanpassning|Beskär för att fylla|Anpassa bredd|Anpassa höjd|Behåll hela fotot och dess proportioner. Om den andra sidan överstiger skärmen förminskas bilden ytterligare.|Exportstorlek`,
  da:`Fototilpasning|Beskær for at fylde|Tilpas bredde|Tilpas højde|Bevar hele billedet og dets proportioner. Hvis den anden side overskrider skærmen, formindskes billedet yderligere.|Eksportstørrelse`,
  pl:`Dopasowanie zdjęcia|Przytnij do ekranu|Dopasuj szerokość|Dopasuj wysokość|Zachowaj całe zdjęcie i jego proporcje. Jeśli drugi bok przekracza ekran, zdjęcie zostanie dodatkowo zmniejszone.|Rozmiar eksportu`,
};
export const framingCatalogs:Record<string,Record<Key,string>>={en:{...framingEnglish}};
for(const [locale,row] of Object.entries(rows)){
  const keys=Object.keys(framingEnglish) as Key[],values=row.split('|');
  if(values.length!==keys.length||values.some(value=>!value.trim()))throw Error(`Invalid photo framing locale ${locale}`);
  framingCatalogs[locale]=Object.fromEntries(keys.map((key,i)=>[key,values[i]])) as Record<Key,string>;
}
