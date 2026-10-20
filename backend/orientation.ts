import {open} from 'node:fs/promises';

/** Our bundled ffprobe omits JPEG EXIF orientation; FFmpeg and browsers apply it. */
export async function jpegOrientation(file:string):Promise<number>{
  const handle=await open(file,'r');
  try{
    const read=async(position:number,length:number)=>{const bytes=Buffer.alloc(length);const result=await handle.read(bytes,0,length,position);return bytes.subarray(0,result.bytesRead);};
    const signature=await read(0,2);if(!signature.equals(Buffer.from([0xff,0xd8])))return 1;
    let position=2;
    while(true){
      const marker=await read(position,2);if(marker.length!==2||marker[0]!==0xff)return 1;
      if(marker[1]===0xff){position++;continue;}
      if(marker[1]===0xda||marker[1]===0xd9)return 1;
      if(marker[1]===0x01||marker[1]>=0xd0&&marker[1]<=0xd8){position+=2;continue;}
      const size=await read(position+2,2);if(size.length!==2)return 1;
      const length=size.readUInt16BE();if(length<2)return 1;
      if(marker[1]===0xe1){
        const payload=await read(position+4,length-2);
        if(payload.subarray(0,6).toString('ascii')==='Exif\0\0'){
          const tiff=payload.subarray(6),little=tiff.subarray(0,2).toString('ascii')==='II';
          if(tiff.length<8||(!little&&tiff.subarray(0,2).toString('ascii')!=='MM'))return 1;
          const u16=(p:number)=>little?tiff.readUInt16LE(p):tiff.readUInt16BE(p),u32=(p:number)=>little?tiff.readUInt32LE(p):tiff.readUInt32BE(p);
          if(u16(2)!==42)return 1;
          const offset=u32(4);if(offset<8||offset>tiff.length-2)return 1;
          const count=u16(offset);
          for(let i=0;i<count;i++){
            const entry=offset+2+i*12;if(entry>tiff.length-12)return 1;
            if(u16(entry)===0x112&&u16(entry+2)===3&&u32(entry+4)===1){const value=u16(entry+8);return value>=1&&value<=8?value:1;}
          }
        }
      }
      position+=2+length;
    }
  }finally{await handle.close();}
}
