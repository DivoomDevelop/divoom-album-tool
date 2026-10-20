export const framingEnglish={photoFraming:'Photo framing',fillCrop:'Proportional crop',fitWidth:'Fit width',fitHeight:'Fit height',fitHint:'Drag the crop box to move it; drag a corner to resize it. The photo stays fixed and keeps its proportions.',exportSize:'Export size',videoFraming:'Video framing',flipHorizontal:'Flip horizontal',flipVertical:'Flip vertical',modified:'Edited',unmodified:'Not edited'} as const;
type Key=keyof typeof framingEnglish;
const rows:Record<string,string>={
  'zh-CN':`照片适配|等比裁剪|宽度适配|高度适配|拖动裁切框调整位置，拖动四角调整框大小。底图固定显示，保持原图比例。|实际导出|视频适配|水平镜像|垂直镜像|已修改|未修改`,
  'zh-TW':`照片適配|等比裁剪|寬度適配|高度適配|拖曳裁切框調整位置，拖曳四角調整框大小。底圖固定顯示，保持原圖比例。|實際匯出|影片適配|水平鏡像|垂直鏡像|已修改|未修改`,
  ja:`写真の表示|縦横比を保って切り抜く|幅に合わせる|高さに合わせる|枠をドラッグして移動し、角でサイズを変更します。写真の表示倍率と元の縦横比を維持します。|書き出しサイズ|動画の表示|左右反転|上下反転|編集済み|未編集`,
  de:`Fotoanpassung|Proportional zuschneiden|An Breite anpassen|An Höhe anpassen|Den Rahmen ziehen, um ihn zu verschieben; die Ecken ändern seine Größe. Das Foto bleibt fest und behält seine Proportionen.|Exportgröße|Videoanpassung|Horizontal spiegeln|Vertikal spiegeln|Bearbeitet|Unbearbeitet`,
  th:`การจัดภาพ|ครอบตัดคงสัดส่วน|พอดีกับความกว้าง|พอดีกับความสูง|ลากกรอบเพื่อย้าย ลากมุมเพื่อปรับขนาด ภาพพื้นหลังคงที่และรักษาสัดส่วนเดิม|ขนาดที่ส่งออก|การจัดวิดีโอ|พลิกแนวนอน|พลิกแนวตั้ง|แก้ไขแล้ว|ยังไม่แก้ไข`,
  ru:`Размещение фото|Обрезать с сохранением пропорций|По ширине|По высоте|Перетащите рамку для перемещения; тяните за угол для изменения размера. Фото остаётся неподвижным и сохраняет пропорции.|Размер экспорта|Размещение видео|Отразить по горизонтали|Отразить по вертикали|Изменено|Не изменено`,
  ko:`사진 맞춤|비율 유지 자르기|너비 맞춤|높이 맞춤|자르기 틀을 끌어 이동하고 모서리를 끌어 크기를 조절합니다. 사진은 고정되며 원본 비율을 유지합니다.|내보내기 크기|동영상 맞춤|좌우 반전|상하 반전|수정됨|수정 안 함`,
  vi:`Căn ảnh|Cắt giữ tỷ lệ|Vừa chiều rộng|Vừa chiều cao|Kéo khung để di chuyển; kéo góc để đổi kích thước. Ảnh giữ nguyên vị trí và tỷ lệ gốc.|Kích thước xuất|Căn video|Lật ngang|Lật dọc|Đã chỉnh sửa|Chưa chỉnh sửa`,
  fr:`Cadrage de la photo|Recadrage proportionnel|Adapter à la largeur|Adapter à la hauteur|Déplacez le cadre en le faisant glisser ; redimensionnez-le par un coin. La photo reste fixe et conserve ses proportions.|Taille exportée|Cadrage vidéo|Retourner horizontalement|Retourner verticalement|Modifiée|Non modifiée`,
  tr:`Fotoğraf yerleşimi|Oranlı kırp|Genişliğe sığdır|Yüksekliğe sığdır|Çerçeveyi sürükleyerek taşıyın; köşeyi sürükleyerek boyutlandırın. Fotoğraf sabit kalır ve oranlarını korur.|Dışa aktarma boyutu|Video yerleşimi|Yatay çevir|Dikey çevir|Düzenlendi|Düzenlenmedi`,
  es:`Encuadre de foto|Recorte proporcional|Ajustar al ancho|Ajustar al alto|Arrastra el marco para moverlo; arrastra una esquina para cambiar su tamaño. La foto permanece fija y mantiene sus proporciones.|Tamaño de exportación|Encuadre de vídeo|Voltear horizontalmente|Voltear verticalmente|Modificada|Sin modificar`,
  pt:`Enquadramento da foto|Recorte proporcional|Ajustar à largura|Ajustar à altura|Arraste a moldura para movê-la; arraste um canto para redimensionar. A foto fica fixa e mantém as proporções.|Tamanho de exportação|Enquadramento do vídeo|Inverter horizontalmente|Inverter verticalmente|Editada|Não editada`,
  id:`Penyesuaian foto|Pangkas proporsional|Sesuaikan lebar|Sesuaikan tinggi|Seret bingkai untuk memindahkannya; seret sudut untuk mengubah ukuran. Foto tetap diam dan mempertahankan proporsinya.|Ukuran ekspor|Penyesuaian video|Balik horizontal|Balik vertikal|Diedit|Belum diedit`,
  it:`Inquadratura foto|Ritaglio proporzionale|Adatta alla larghezza|Adatta all’altezza|Trascina il riquadro per spostarlo; trascina un angolo per ridimensionarlo. La foto resta fissa e mantiene le proporzioni.|Dimensioni di esportazione|Inquadratura video|Capovolgi orizzontalmente|Capovolgi verticalmente|Modificata|Non modificata`,
  uk:`Розміщення фото|Обрізати зі збереженням пропорцій|За шириною|За висотою|Перетягніть рамку для переміщення; тягніть за кут для зміни розміру. Фото залишається нерухомим і зберігає пропорції.|Розмір експорту|Розміщення відео|Віддзеркалити горизонтально|Віддзеркалити вертикально|Змінено|Не змінено`,
  sv:`Fotoanpassning|Proportionell beskärning|Anpassa bredd|Anpassa höjd|Dra ramen för att flytta den; dra i ett hörn för att ändra storlek. Fotot ligger stilla och behåller proportionerna.|Exportstorlek|Videoanpassning|Vänd horisontellt|Vänd vertikalt|Redigerad|Inte redigerad`,
  da:`Fototilpasning|Proportional beskæring|Tilpas bredde|Tilpas højde|Træk rammen for at flytte den; træk i et hjørne for at ændre størrelse. Fotoet forbliver fast og bevarer proportionerne.|Eksportstørrelse|Videotilpasning|Vend vandret|Vend lodret|Redigeret|Ikke redigeret`,
  pl:`Dopasowanie zdjęcia|Przytnij proporcjonalnie|Dopasuj szerokość|Dopasuj wysokość|Przeciągnij ramkę, aby ją przesunąć; przeciągnij narożnik, aby zmienić rozmiar. Zdjęcie pozostaje nieruchome i zachowuje proporcje.|Rozmiar eksportu|Dopasowanie wideo|Odbij poziomo|Odbij pionowo|Edytowano|Nie edytowano`,
};
export const framingCatalogs:Record<string,Record<Key,string>>={en:{...framingEnglish}};
for(const [locale,row] of Object.entries(rows)){
  const keys=Object.keys(framingEnglish) as Key[],values=row.split('|');
  if(values.length!==keys.length||values.some(value=>!value.trim()))throw Error(`Invalid photo framing locale ${locale}`);
  framingCatalogs[locale]=Object.fromEntries(keys.map((key,i)=>[key,values[i]])) as Record<Key,string>;
}
