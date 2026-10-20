export const framingEnglish={photoFraming:'Photo framing',fillCrop:'Proportional crop',fitWidth:'Fit width',fitHeight:'Fit height',fitHint:'Fit the editing view to width or height; scroll to inspect. Export keeps the original proportions within device limits.',exportSize:'Export size',videoFraming:'Video framing'} as const;
type Key=keyof typeof framingEnglish;
const rows:Record<string,string>={
  'zh-CN':`照片适配|等比裁剪|宽度适配|高度适配|按宽度或高度适配编辑视图，可滚动查看。导出保持原始宽高比例，宽高不超过设备上限。|实际导出|视频适配`,
  'zh-TW':`照片適配|等比裁剪|寬度適配|高度適配|依寬度或高度調整編輯視圖，可捲動查看。匯出保持原始寬高比例，寬高不超過裝置上限。|實際匯出|影片適配`,
  ja:`写真の表示|縦横比を保って切り抜く|幅に合わせる|高さに合わせる|編集表示を幅や高さに合わせます。スクロールで確認できます。元の縦横比を保ち、端末のサイズ内で書き出します。|書き出しサイズ|動画の表示`,
  de:`Fotoanpassung|Proportional zuschneiden|An Breite anpassen|An Höhe anpassen|Die Bearbeitungsansicht an Breite oder Höhe anpassen und zum Prüfen scrollen. Der Export behält das Originalformat innerhalb der Gerätegrenzen.|Exportgröße|Videoanpassung`,
  th:`การจัดภาพ|ครอบตัดคงสัดส่วน|พอดีกับความกว้าง|พอดีกับความสูง|ปรับมุมมองแก้ไขตามความกว้างหรือความสูง เลื่อนเพื่อตรวจดู ส่งออกโดยคงสัดส่วนเดิมภายในขนาดของอุปกรณ์|ขนาดที่ส่งออก|การจัดวิดีโอ`,
  ru:`Размещение фото|Обрезать с сохранением пропорций|По ширине|По высоте|Подгоните область редактирования по ширине или высоте; прокрутите для просмотра. Экспорт сохраняет исходные пропорции в пределах размеров устройства.|Размер экспорта|Размещение видео`,
  ko:`사진 맞춤|비율 유지 자르기|너비 맞춤|높이 맞춤|편집 화면을 너비 또는 높이에 맞추고 스크롤하여 확인합니다. 원본 비율을 유지하며 기기의 크기 이내로 내보냅니다.|내보내기 크기|동영상 맞춤`,
  vi:`Căn ảnh|Cắt giữ tỷ lệ|Vừa chiều rộng|Vừa chiều cao|Căn khung chỉnh sửa theo chiều rộng hoặc chiều cao, cuộn để xem. Xuất giữ tỷ lệ gốc trong giới hạn kích thước thiết bị.|Kích thước xuất|Căn video`,
  fr:`Cadrage de la photo|Recadrage proportionnel|Adapter à la largeur|Adapter à la hauteur|Adapter la vue à la largeur ou à la hauteur ; faire défiler pour vérifier. L’export conserve les proportions d’origine dans les limites de l’appareil.|Taille exportée|Cadrage vidéo`,
  tr:`Fotoğraf yerleşimi|Oranlı kırp|Genişliğe sığdır|Yüksekliğe sığdır|Düzenleme görünümünü genişliğe veya yüksekliğe sığdırın; incelemek için kaydırın. Dışa aktarım, cihaz sınırları içinde özgün oranları korur.|Dışa aktarma boyutu|Video yerleşimi`,
  es:`Encuadre de foto|Recorte proporcional|Ajustar al ancho|Ajustar al alto|Ajusta la vista de edición al ancho o al alto; desplázate para revisar. La exportación conserva las proporciones originales dentro de los límites del dispositivo.|Tamaño de exportación|Encuadre de vídeo`,
  pt:`Enquadramento da foto|Recorte proporcional|Ajustar à largura|Ajustar à altura|Ajuste a visualização à largura ou à altura; role para conferir. A exportação mantém as proporções originais dentro dos limites do dispositivo.|Tamanho de exportação|Enquadramento do vídeo`,
  id:`Penyesuaian foto|Pangkas proporsional|Sesuaikan lebar|Sesuaikan tinggi|Sesuaikan tampilan edit dengan lebar atau tinggi; gulir untuk memeriksa. Ekspor mempertahankan proporsi asli dalam batas ukuran perangkat.|Ukuran ekspor|Penyesuaian video`,
  it:`Inquadratura foto|Ritaglio proporzionale|Adatta alla larghezza|Adatta all’altezza|Adatta la vista alla larghezza o all’altezza; scorri per controllare. L’esportazione mantiene le proporzioni originali entro i limiti del dispositivo.|Dimensioni di esportazione|Inquadratura video`,
  uk:`Розміщення фото|Обрізати зі збереженням пропорцій|За шириною|За висотою|Припасуйте область редагування за шириною або висотою; прокрутіть для перегляду. Експорт зберігає початкові пропорції в межах розмірів пристрою.|Розмір експорту|Розміщення відео`,
  sv:`Fotoanpassning|Proportionell beskärning|Anpassa bredd|Anpassa höjd|Anpassa redigeringsvyn efter bredd eller höjd och rulla för att granska. Exporten behåller originalets proportioner inom enhetens gränser.|Exportstorlek|Videoanpassning`,
  da:`Fototilpasning|Proportional beskæring|Tilpas bredde|Tilpas højde|Tilpas redigeringsvisningen til bredde eller højde, og rul for at kontrollere. Eksporten bevarer originalens proportioner inden for enhedens grænser.|Eksportstørrelse|Videotilpasning`,
  pl:`Dopasowanie zdjęcia|Przytnij proporcjonalnie|Dopasuj szerokość|Dopasuj wysokość|Dopasuj widok edycji do szerokości lub wysokości i przewiń, aby sprawdzić. Eksport zachowuje oryginalne proporcje w granicach rozmiarów urządzenia.|Rozmiar eksportu|Dopasowanie wideo`,
};
export const framingCatalogs:Record<string,Record<Key,string>>={en:{...framingEnglish}};
for(const [locale,row] of Object.entries(rows)){
  const keys=Object.keys(framingEnglish) as Key[],values=row.split('|');
  if(values.length!==keys.length||values.some(value=>!value.trim()))throw Error(`Invalid photo framing locale ${locale}`);
  framingCatalogs[locale]=Object.fromEntries(keys.map((key,i)=>[key,values[i]])) as Record<Key,string>;
}
