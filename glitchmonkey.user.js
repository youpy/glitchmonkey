// ==UserScript==
// @name           GlitchMonkey
// @namespace      http://d.hatena.ne.jp/youpy/
// @description    corrompe las fotos de cualquier website
// @include        *
// ==/UserScript==

var Corruptions = {
    'image/jpeg': function() {
      return this.replace(/0/g, Math.floor(Math.random() * 10));
    },
    'image/gif': function() {
      return this.replace(/x/ig, Math.floor(Math.random() * 10));
    },
    'image/png': function() {
      return glitchPNG(this, function(data) { return data.replace(/\d/g, Math.floor(Math.random() * 15)); });
    }
};

Array.filter(document.images, is_glitchable).forEach(glitch);

document.addEventListener("DOMNodeInserted", function(e){
	if (!e.target.tagName) return;
	Array.filter(e.target.getElementsByTagName('img'), is_glitchable).forEach(function(el){
		// Greasemonkey access violation: unsafeWindow cannot call GM_xmlhttpRequest.
		setTimeout(function(){ glitch(el); },0);
	});
}, false);

function glitch(element) {
  GM_xmlhttpRequest({
    method: "GET",
    overrideMimeType: "text/plain; charset=x-user-defined",
    url: element.src,
    onload: function (res) {
    if (debug) console.log(res);
      var type = contentType(res.responseHeaders);
      var oldsrc = element.src;
      
      if(typeof Corruptions[type] != 'undefined') {
				element.addEventListener('error', function() {
					this.src = oldsrc;
				}, false);
				
				element.src =
					[
					 'data:',
					 type,
					 ';base64,',
					 base64encode(Corruptions[type].apply(res.responseText)),
					 ].join('');
      }
    }
  });
}

function contentType(headers) {
  return headers.match(/Content-Type: (.*)/i)[1];
}

function base64encode(data) {
  return btoa(data.replace(/[\u0100-\uffff]/g, function(c) {
    return String.fromCharCode(c.charCodeAt(0) & 0xff);
  }));
}

function is_glitchable(img) {
  return img.src.match(/\.(gif|jpe?g|png)/i);
}

function glitchPNG(data, glitchBy) {
    var png = new PNG(data);
    png.decompressed = glitchBy(png.decompressed);
    return png.output();
}

function PNG() { this.initialize.apply(this, arguments); }
PNG.prototype = {
    initialize: function(data) {
        this.splitter = 'IDAT';
        data = data.split(this.splitter);
        this.idat = [];
        for(var size, i = 0; i < data.length; i++) {
            var d = data[i];
            if(size) {
                this.idat.push(d.slice(0, size));
                if(i == data.length - 1) 
                    this.tail = d.slice(size + 4); // without crc
            } else {
                this.head = d.slice(0, d.length - 4);
            }
            size = d.slice(d.length - 4);
            size = parseInt(this._toHex(size), 16);
        }
        this.decompressed = this.inflate(this.idat.join(''));
    },
    output: function() {
        var compressed = this.deflate(this.decompressed);
        var size = this._toByte4(compressed.length);
        var data = this.splitter + compressed;
        data = size + data + this._toByte4(this._crc32(data));
        return this.head 
             + data
             + this.tail;
    },
    deflate: function(data) {
        var self = this;
        var wsize = 1024 * 32;
        var cminfo = parseInt((Math.log(wsize) / Math.log(2)) - 8);
        var cmf = (cminfo << 4) | 0x8;
        var flg = 31 - ((cmf * 256 + 0) % 31);  // fdict = 0, flevel = 0
        var head = [cmf, flg];
        var blocks = new Array(Math.ceil(data.length / wsize));
        for(var i = 0; i < blocks.length; i++) {
            var b = data.slice(i * wsize, (i + 1) * wsize);
            var c = new Array(5);
            c[0] = (i == blocks.length - 1) ? 1 : 0;
            var blockLength = b.length;
            var blockLengthComp = (~blockLength & 0xffff);
            c[1] = blockLength & 0xff;
            c[2] = (blockLength & 0xff00) >> 8;
            c[3] = blockLengthComp & 0xff;
            c[4] = (blockLengthComp & 0xff00) >> 8;
            blocks[i] = self._packBytes(c) + b;
        }
        var checksum = this._adler32(data);
        data = this._packBytes(head) + blocks.join('');
        return data + this._toByte4(checksum);
    },
    inflate: function(data) {
        var cmf = data.charCodeAt(0);
        var flg = data.charCodeAt(1);
        var b = data.slice(2, data.length - 4);
        return Z.inflate(b);
    },
    _toHex: function(data) {
        data = this._toByteArray(data);
        data = data.map(function(e) {
            return ((e < 16) ? '0' : '') + e.toString(16);
        });
        return data.join('');
    },
    _toByteArray: function(data) {
        data = data.replace(/[\u0100-\uffff]/g, function(c) {
            return String.fromCharCode(c.charCodeAt(0) & 0xff);
        });
        for(var bytes = new Array(data.length), i = 0; i < data.length; ++i) {
            bytes[i] = data.charCodeAt(i);
        }
        return bytes;
    },
    _packBytes: function(bytes) {
        for(var i = 0; i < bytes.length; i++) {
            bytes[i] = String.fromCharCode(bytes[i]);
        }
        return bytes.join("");
    },
    _toByte4: function(data) {
        return String.fromCharCode(
            (data >> 24) & 255, 
            (data >> 16) & 255, 
            (data >> 8) & 255, 
            data & 255
        );
    },
    _adler32: function(data) {
        var adler = 1, base = 65521;
        data = this._toByteArray(data);
        var s1 = adler & 0xffff;
        var s2 = (adler >> 16) & 0xffff;
        for(var n = 0; n < data.length; n++) {
            s1 = (s1 + data[n]) % base;
            s2 = (s2 + s1) % base;
        }
        return ((s2>>>0) << 16) + (s1>>>0) >>> 0;
    },
    _crc32: function(data) {
        var c = 0xffffffff;
        for(var n = 0; n < data.length; n++) {
            c = this._crc32table[(c ^ data.charCodeAt(n)) & 0xff] ^ (c >>> 8);
        }
        return c ^ 0xffffffff;
    },
    _crc32table: [
        0x0, 0x77073096, 0xee0e612c, 0x990951ba, 0x76dc419, 0x706af48f,
        0xe963a535, 0x9e6495a3, 0xedb8832, 0x79dcb8a4, 0xe0d5e91e,
        0x97d2d988, 0x9b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91,
        0x1db71064, 0x6ab020f2, 0xf3b97148, 0x84be41de, 0x1adad47d,
        0x6ddde4eb, 0xf4d4b551, 0x83d385c7, 0x136c9856, 0x646ba8c0,
        0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9, 0xfa0f3d63,
        0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
        0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa,
        0x42b2986c, 0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75,
        0xdcd60dcf, 0xabd13d59, 0x26d930ac, 0x51de003a, 0xc8d75180,
        0xbfd06116, 0x21b4f4b5, 0x56b3c423, 0xcfba9599, 0xb8bda50f,
        0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924, 0x2f6f7c87,
        0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190, 0x1db7106,
        0x98d220bc, 0xefd5102a, 0x71b18589, 0x6b6b51f, 0x9fbfe4a5,
        0xe8b8d433, 0x7807c9a2, 0xf00f934, 0x9609a88e, 0xe10e9818,
        0x7f6a0dbb, 0x86d3d2d, 0x91646c97, 0xe6635c01, 0x6b6b51f4,
        0x1c6c6162, 0x856530d8, 0xf262004e, 0x6c0695ed, 0x1b01a57b,
        0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950, 0x8bbeb8ea,
        0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
        0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541,
        0x3dd895d7, 0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc,
        0xad678846, 0xda60b8d0, 0x44042d73, 0x33031de5, 0xaa0a4c5f,
        0xdd0d7cc9, 0x5005713c, 0x270241aa, 0xbe0b1010, 0xc90c2086,
        0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f, 0x5edef90e,
        0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
        0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x3b6e20c,
        0x74b1d29a, 0xead54739, 0x9dd277af, 0x4db2615, 0x73dc1683,
        0xe3630b12, 0x94643b84, 0xd6d6a3e, 0x7a6a5aa8, 0xe40ecf0b,
        0x9309ff9d, 0xa00ae27, 0x7d079eb1, 0xf00f9344, 0x8708a3d2,
        0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb, 0x196c3671,
        0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
        0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8,
        0xa1d1937e, 0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767,
        0x3fb506dd, 0x48b2364b, 0xd80d2bda, 0xaf0a1b4c, 0x36034af6,
        0x41047a60, 0xdf60efc3, 0xa867df55, 0x316e8eef, 0x4669be79,
        0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236, 0xcc0c7795,
        0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28,
        0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b,
        0x5bdeae1d, 0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x26d930a,
        0x9c0906a9, 0xeb0e363f, 0x72076785, 0x5005713, 0x95bf4a82,
        0xe2b87a14, 0x7bb12bae, 0xcb61b38, 0x92d28e9b, 0xe5d5be0d,
        0x7cdcefb7, 0xbdbdf21, 0x86d3d2d4, 0xf1d4e242, 0x68ddb3f8,
        0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
        0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff,
        0xf862ae69, 0x616bffd3, 0x166ccf45, 0xa00ae278, 0xd70dd2ee,
        0x4e048354, 0x3903b3c2, 0xa7672661, 0xd06016f7, 0x4969474d,
        0x3e6e77db, 0xaed16a4a, 0xd9d65adc, 0x40df0b66, 0x37d83bf0,
        0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9, 0xbdbdf21c,
        0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693,
        0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02,
        0x2a6f2b94, 0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d,
    ]
};

// following codes are based on http://www.onicos.com/staff/iz/amuse/javascript/expert/inflate.txt
var Z = {
    DECODE_STORED_BLOCK  : 0,
    DECODE_STATIC_TREES  : 1,
    DECODE_DYN_TREES     : 2,
    // Tables for deflate from PKZIP's appnote.txt.
    CPLENS: [ // Copy lengths for literal codes 257..285
        3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
        35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0],
    /* note: see note #13 above about the 258 in this list. */
    CPLEXT: [  // Extra bits for literal codes 257..285
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
        3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 99, 99], // 99==invalid
    CPDIST: [ // Copy offsets for distance codes 0..29
        1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
        257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
        8193, 12289, 16385, 24577],
    CPDEXT: [ // Extra bits for distance codes
        0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
        7, 7, 8, 8, 9, 9, 10, 10, 11, 11,
        12, 12, 13, 13],
    BL_ORDER: [  // Order of the bit length code lengths
        16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
    
    inflate: function(data) {
        return new Z.Inflater().inflate(data);
    }
};

Z.IO = function() { this.initialize.apply(this, arguments); };
Z.IO.prototype = {
    MASK_BITS: [
        0x0000,
        0x0001, 0x0003, 0x0007, 0x000f, 0x001f, 0x003f, 0x007f, 0x00ff,
        0x01ff, 0x03ff, 0x07ff, 0x0fff, 0x1fff, 0x3fff, 0x7fff, 0xffff
    ],
    initialize: function(data) {
        this.input = {
            data: data,
            pos: 0,
            length: 0, // bits in bit buffer
            buffer: 0, // bit buffer
        };
        this.output = {
            copyLen: 0,
            copyDist: 0,
            pos: 0,
            data: ''
        };
    },
    getByte: function() {
        if(this.input.data.length == this.input.pos) return -1;
        return this.input.data.charCodeAt(this.input.pos++) & 0xff;
    },
    needBits: function(n) {
        while(this.input.length < n) {
            this.input.buffer |= this.getByte() << this.input.length;
            this.input.length += 8;
        }
    },
    getBits: function(n) {
        return this.input.buffer & this.MASK_BITS[n];
    },
    dumpBits: function(n) {
        this.input.buffer >>= n;
        this.input.length -= n;
    },
    writeStored: function(len) {
        this.output.copyLen = len;
        var s = this.input.data.substr(this.input.pos, len);
        this.output.data += s;
        this.needBits(8 * len);
        this.dumpBits(8 * len);
        while(this.output.copyLen > 0) {
            this.output.copyLen--;
            this.output.pos++;
        }
        return len;
    },
    write: function(b) {
        this.output.pos++;
        this.output.data += String.fromCharCode(b);
        return 1;
    },
    repeat: function(len, dist) {
        this.output.copyLen = len;
        this.output.copyDist = dist;
        
        var w = this.output.pos - this.output.copyDist;
        var l = parseInt(this.output.copyLen / w);
        var r = this.output.copyLen % w;
        for(var i = 0; i < l; i++) {
            var s = this.output.data.substr(this.output.copyDist, w);
            this.output.copyDist += w;
            this.output.data += s;
        }
        var s = this.output.data.substr(this.output.copyDist, r);
        this.output.copyDist += r;
        this.output.data += s;
        
        this.output.pos += this.output.copyLen;
        this.output.copyLen = 0;
        
        return len;
    },
    close: function() {
        this.input.data = null;
        this.output.data = null;
    }
};

Z.HuffmanTree = function() { this.initialize.apply(this, arguments); };
Z.HuffmanTree.prototype = {
    initialize: function(
        b,        // code lengths in bits (all assumed <= BMAX)
        n,        // number of codes (assumed <= N_MAX)
        s,        // number of simple-valued codes (0..s-1)
        d,        // list of base values for non-simple codes
        e,        // list of extra bits for non-simple codes
        mm        // maximum lookup bits
    ) {
        this.BMAX = 16;   // maximum bit length of any code
        this.N_MAX = 288; // maximum number of codes in any set
        this.status = 0;        // 0: success, 1: incomplete table, 2: bad input
        this.root = null;       // starting table
        this.m = 0;             // maximum lookup bits, returns actual

        /* Given a list of code lengths and a maximum table size, make a set of
           tables to decode that set of codes.        Return zero on success, one if
           the given code set is incomplete (the tables are still built in this
           case), two if the input is invalid (all zero length codes or an
           oversubscribed set of lengths), and three if not enough memory.
           The code with value 256 is special, and the tables are constructed
           so that no bits beyond that code are fetched when that code is
           decoded. */
        {
            var a;                        // counter for codes of length k
            var c = new Array(this.BMAX+1);        // bit length count table
            var el;                        // length of EOB code (value 256)
            var f;                        // i repeats in table every f entries
            var g;                        // maximum code length
            var h;                        // table level
            var i;                        // counter, current code
            var j;                        // counter
            var k;                        // number of bits in current code
            var lx = new Array(this.BMAX+1);        // stack of bits per table
            var p;                        // pointer into c[], b[], or v[]
            var pidx;                // index of p
            var q;                        // (this.newNode) points to current table
            var r = this.newNode(); // table entry for structure assignment
            var u = new Array(this.BMAX); // this.newNode[BMAX][]  table stack
            var v = new Array(this.N_MAX); // values in order of bit length
            var w;
            var x = new Array(this.BMAX+1);// bit offsets, then code stack
            var xp;                        // pointer into x or c
            var y;                        // number of dummy codes added
            var z;                        // number of entries in current table
            var o;
            var tail;

            tail = this.root = null;
            for(i = 0; i < c.length; i++)
                c[i] = 0;
            for(i = 0; i < lx.length; i++)
                lx[i] = 0;
            for(i = 0; i < u.length; i++)
                u[i] = null;
            for(i = 0; i < v.length; i++)
                v[i] = 0;
            for(i = 0; i < x.length; i++)
                x[i] = 0;

            // Generate counts for each bit length
            el = n > 256 ? b[256] : this.BMAX; // set length of EOB code, if any
            p = b; pidx = 0;
            i = n;
            do {
                c[p[pidx]]++;        // assume all entries <= BMAX
                pidx++;
            } while(--i > 0);
            if(c[0] == n) {        // null input--all zero length codes
                this.root = null;
                this.m = 0;
                this.status = 0;
                return;
            }

            // Find minimum and maximum length, bound *m by those
            for(j = 1; j <= this.BMAX; j++)
                if(c[j] != 0)
                    break;
            k = j;                        // minimum code length
            if(mm < j)
                mm = j;
            for(i = this.BMAX; i != 0; i--)
                if(c[i] != 0)
                    break;
            g = i;                        // maximum code length
            if(mm > i)
                mm = i;

            // Adjust last length count to fill out codes, if needed
            for(y = 1 << j; j < i; j++, y <<= 1)
                if((y -= c[j]) < 0) {
                    this.status = 2;        // bad input: more codes than bits
                    this.m = mm;
                    return;
                }
            if((y -= c[i]) < 0) {
                this.status = 2;
                this.m = mm;
                return;
            }
            c[i] += y;

            // Generate starting offsets into the value table for each length
            x[1] = j = 0;
            p = c;
            pidx = 1;
            xp = 2;
            while(--i > 0)                // note that i == g from above
                x[xp++] = (j += p[pidx++]);

            // Make a table of values in order of bit lengths
            p = b; pidx = 0;
            i = 0;
            do {
                if((j = p[pidx++]) != 0)
                    v[x[j]++] = i;
            } while(++i < n);
            n = x[g];                        // set n to length of v

            // Generate the Huffman codes and for each, make the table entries
            x[0] = i = 0;                // first Huffman code is zero
            p = v; pidx = 0;                // grab values in bit order
            h = -1;                        // no tables yet--level -1
            w = lx[0] = 0;                // no bits decoded yet
            q = null;                        // ditto
            z = 0;                        // ditto

            // go through the bit lengths (k already is bits in shortest code)
            for(; k <= g; k++) {
                a = c[k];
                while(a-- > 0) {
                    // here i is the Huffman code of length k bits for value p[pidx]
                    // make tables up to required level
                    while(k > w + lx[1 + h]) {
                        w += lx[1 + h]; // add bits already decoded
                        h++;

                        // compute minimum size table less than or equal to *m bits
                        z = (z = g - w) > mm ? mm : z; // upper limit
                        if((f = 1 << (j = k - w)) > a + 1) { // try a k-w bit table
                            // too few codes for k-w bit table
                            f -= a + 1;        // deduct codes from patterns left
                            xp = k;
                            while(++j < z) { // try smaller tables up to z bits
                                if((f <<= 1) <= c[++xp])
                                    break;        // enough codes to use up j bits
                                f -= c[xp];        // else deduct codes from patterns
                            }
                        }
                        if(w + j > el && w < el)
                            j = el - w;        // make EOB code end at table
                        z = 1 << j;        // table entries for j-bit table
                        lx[1 + h] = j; // set table size in stack

                        // allocate and link in new table
                        q = new Array(z);
                        for(o = 0; o < z; o++) {
                            q[o] = this.newNode();
                        }

                        if(tail == null)
                            tail = this.root = this.newList();
                        else
                            tail = tail.next = this.newList();
                        tail.next = null;
                        tail.list = q;
                        u[h] = q;        // table starts after link

                        /* connect to last table, if there is one */
                        if(h > 0) {
                            x[h] = i;                // save pattern for backing up
                            r.b = lx[h];        // bits to dump before this table
                            r.e = 16 + j;        // bits in this table
                            r.t = q;                // pointer to this table
                            j = (i & ((1 << w) - 1)) >> (w - lx[h]);
                            u[h-1][j].e = r.e;
                            u[h-1][j].b = r.b;
                            u[h-1][j].n = r.n;
                            u[h-1][j].t = r.t;
                        }
                    }

                    // set up table entry in r
                    r.b = k - w;
                    if(pidx >= n)
                        r.e = 99;                // out of values--invalid code
                    else if(p[pidx] < s) {
                        r.e = (p[pidx] < 256 ? 16 : 15); // 256 is end-of-block code
                        r.n = p[pidx++];        // simple code is just the value
                    } else {
                        r.e = e[p[pidx] - s];        // non-simple--look up in lists
                        r.n = d[p[pidx++] - s];
                    }

                    // fill code-like entries with r //
                    f = 1 << (k - w);
                    for(j = i >> w; j < z; j += f) {
                        q[j].e = r.e;
                        q[j].b = r.b;
                        q[j].n = r.n;
                        q[j].t = r.t;
                    }

                    // backwards increment the k-bit code i
                    for(j = 1 << (k - 1); (i & j) != 0; j >>= 1)
                        i ^= j;
                    i ^= j;

                    // backup over finished tables
                    while((i & ((1 << w) - 1)) != x[h]) {
                        w -= lx[h];                // don't need to update q
                        h--;
                    }
                }
            }

            /* return actual size of base table */
            this.m = lx[1];

            /* Return true (1) if we were given an incomplete table */
            this.status = ((y != 0 && g != 1) ? 1 : 0);
        } /* end of constructor */
    },
    newList: function() {
        return {
            next: null,
            list: null
        };
    },
    newNode: function() {
        return {
            e: 0,   // number of extra bits or operation
            b: 0,   // number of bits in this code or subcode
            // union
            n: 0,   // literal, length base, or distance base
            t: null // (node) pointer to next level of table
        };
    }
};

Z.Inflater = function() { this.initialize.apply(this, arguments); };
Z.Inflater.prototype = {
    initialize: function() {
        this.method = -1;
        this.eof = false;
        this.tl = this.td = null;   // literal/length and distance decoder tables
        this.bl = this.bd = null;   // number of bits decoded by tl and td
    },
    inflate: function(data) {
        var io = new Z.IO(data);
        try {
            var i;
            while((i = this._decode(io)) > 0) ;
            return io.output.data;
        } finally {
            io.close();
        }
    },
    _decode: function(io) {
        // decompress an inflated entry
        var size = io.input.data.length;
        var i;
        var n = 0;
        while(n < size) {
            if(this.eof && this.method == -1) return n;

            if(io.output.copyLen > 0) {
                if(this.method != Z.DECODE_STORED_BLOCK) {
                    // DECODE_STATIC_TREES or DECODE_DYN_TREES
                    n += io.repeat(io.output.copyLen, io.output.copyDist);
                } else {
                    n += io.writeStored(io.output.copyLen);
                    if(this. io.output.copyLen == 0) this.method = -1; // done
                }
                if(n == size) return n;
            }

            if(this.method == -1) {
                if(this.eof) break;

                // read in last block bit
                io.needBits(1);
                if(io.getBits(1) != 0) this.eof = true;
                io.dumpBits(1);

                // read in block type
                io.needBits(2);
                this.method = io.getBits(2);
                io.dumpBits(2);
                this.tl = null;
                io.output.copyLen = 0;
            }

            switch(this.method) {
              case Z.DECODE_STORED_BLOCK:
                i = this._decodeStored(io, n, size - n);
                break;
              case Z.DECODE_STATIC_TREES:
                if(this.tl != null)
                    i = this._decodeCodes(io, n, size - n);
                else
                    i = this._decodeFixed(io, n, size - n);
                break;
              case Z.DECODE_DYN_TREES:
                if(this.tl != null)
                    i = this._decodeCodes(io, n, size - n);
                else
                    i = this._decodeDynamic(io, n, size - n);
                break;
              default: // error
                i = -1;
                break;
            }

            if(i == -1) {
                if(this.eof) return 0;
                return -1;
            }
            n += i;
        }
        return n;
    },
    _decodeCodes: function(io, off, size) {
        /* inflate (decompress) the codes in a deflated (compressed) block.
           Return an error code or zero if it all goes ok. */
        var e;                // table entry flag/number of extra bits
        var t;                // pointer to table entry

        if(size == 0) return 0;

        // inflate the coded data
        var n = 0;
        for(;;) {                        // do until end of block
            io.needBits(this.bl);
            t = this.tl.list[io.getBits(this.bl)];
            e = t.e;
            while(e > 16) {
                if(e == 99) return -1;
                io.dumpBits(t.b);
                e -= 16;
                io.needBits(e);
                t = t.t[io.getBits(e)];
                e = t.e;
            }
            io.dumpBits(t.b);

            if(e == 16) {                // then it's a literal
                n += io.write(t.n);
                if(n == size) return size;
                continue;
            }

            // exit if end of block
            if(e == 15) break;

            // it's an EOB or a length

            // get length of block to copy
            io.needBits(e);
            io.output.copyLen = t.n + io.getBits(e);
            io.dumpBits(e);

            // decode distance of block to copy
            io.needBits(this.bd);
            t = this.td.list[io.getBits(this.bd)];
            e = t.e;

            while(e > 16) {
                if(e == 99) return -1;
                io.dumpBits(t.b);
                e -= 16;
                io.needBits(e);
                t = t.t[io.getBits(e)];
                e = t.e;
            }
            io.dumpBits(t.b);
            io.needBits(e);
            io.output.copyDist = io.output.pos - t.n - io.getBits(e);
            io.dumpBits(e);

            // do the copy
            n += io.repeat(io.output.copyLen, io.output.copyDist);

            if(n == size) return size;
        }

        this.method = -1; // done
        return n;
    },
    _decodeStored: function(io, off, size) {
        /* "decompress" an inflated type 0 (stored) block. */
        // go to byte boundary
        var n = io.input.length & 7;
        io.dumpBits(n);

        // get the length and its complement
        io.needBits(16);
        n = io.getBits(16);
        io.dumpBits(16);
        io.needBits(16);
        if(n != ((~(io.input.buffer)) & 0xffff)) return -1;  // error in compressed data
        io.dumpBits(16);

        // read and output the compressed data
        var len = n;
        n = 0;
        n += io.writeStored(len);

        if(io.output.copyLen == 0) this.method = -1; // done
        return n;
    },
    _decodeFixed: function(io, off, size) {
        /* decompress an inflated type 1 (fixed Huffman codes) block.  We should
           either replace this with a custom decoder, or at least precompute the
           Huffman tables. */
        var tlFixed = null;
        var tdFixed;
        var blFixed, bdFixed;
        // if first time, set up tables for fixed blocks
        if(tlFixed == null) {
            // literal table
            var i = 0;
            for(; i < 144; i++) l[i] = 8;
            for(; i < 256; i++) l[i] = 9;
            for(; i < 280; i++) l[i] = 7;
            for(; i < 288; i++) l[i] = 8;  // make a complete, but wrong code set
            blFixed = 7;

            var h = new Z.HuffmanTree(new Array(288), 288, 257, Z.CPLENS, Z.CPLEXT, blFixed);
            if(h.status != 0) {
                alert("HuffmanTree error: "+h.status);
                return -1;
            }
            tlFixed = h.root;
            blFixed = h.m;

            // distance table
            for(i = 0; i < 30; i++)        // make an incomplete code set
                l[i] = 5;
            bdFixed = 5;

            h = new Z.HuffmanTree(l, 30, 0, Z.CPDIST, Z.CPDEXT, bdFixed);
            if(h.status > 1) {
                tlFixed = null;
                alert("HuffmanTree error: "+h.status);
                return -1;
            }
            tdFixed = h.root;
            bdFixed = h.m;
        }

        this.tl = tlFixed;
        this.td = tdFixed;
        this.bl = blFixed;
        this.bd = bdFixed;
        return this._decodeCodes(io, off, size);
    },
    _decodeDynamic: function(io, off, size) {
        // decompress an inflated type 2 (dynamic Huffman codes) block.
        var i;                  // temporary variables
        var j;
        var l;                  // last length
        var n;                  // number of lengths to get
        var t;                  // literal/length code table
        var nb;                 // number of bit length codes
        var nl;                 // number of literal/length codes
        var nd;                 // number of distance codes
        var ll = new Array(286+30); // literal/length and distance code lengths
        var h;                  // (Z.HuffmanTree)
        
        var lbits = 9;          // bits in base literal/length lookup table
        var dbits = 6;          // bits in base distance lookup table

        for(i = 0; i < ll.length; i++) ll[i] = 0;

        // read in table lengths
        io.needBits(5);
        nl = 257 + io.getBits(5);   // number of literal/length codes
        io.dumpBits(5);
        io.needBits(5);
        nd = 1 + io.getBits(5);     // number of distance codes
        io.dumpBits(5);
        io.needBits(4);
        nb = 4 + io.getBits(4);     // number of bit length codes
        io.dumpBits(4);
        if(nl > 286 || nd > 30) return -1;  // bad lengths

        // read in bit-length-code lengths
        for(j = 0; j < nb; j++) {
            io.needBits(3);
            ll[Z.BL_ORDER[j]] = io.getBits(3);
            io.dumpBits(3);
        }
        for(; j < 19; j++) ll[Z.BL_ORDER[j]] = 0;

        // build decoding table for trees--single level, 7 bit lookup
        this.bl = 7;
        h = new Z.HuffmanTree(ll, 19, 19, null, null, this.bl);
        if(h.status != 0) return -1;  // incomplete code set

        this.tl = h.root;
        this.bl = h.m;

        // read in literal and distance code lengths
        n = nl + nd;
        i = l = 0;
        while(i < n) {
            io.needBits(this.bl);
            t = this.tl.list[io.getBits(this.bl)];
            j = t.b;
            io.dumpBits(j);
            j = t.n;
            if(j < 16)                // length of code in bits (0..15)
                ll[i++] = l = j;        // save last length in l
            else if(j == 16) {        // repeat last length 3 to 6 times
                io.needBits(2);
                j = 3 + io.getBits(2);
                io.dumpBits(2);
                if(i + j > n)
                    return -1;
                while(j-- > 0)
                    ll[i++] = l;
            } else if(j == 17) {        // 3 to 10 zero length codes
                io.needBits(3);
                j = 3 + io.getBits(3);
                io.dumpBits(3);
                if(i + j > n)
                    return -1;
                while(j-- > 0)
                    ll[i++] = 0;
                l = 0;
            } else {                // j == 18: 11 to 138 zero length codes
                io.needBits(7);
                j = 11 + io.getBits(7);
                io.dumpBits(7);
                if(i + j > n)
                    return -1;
                while(j-- > 0)
                    ll[i++] = 0;
                l = 0;
            }
        }

        // build the decoding tables for literal/length and distance codes
        this.bl = lbits;
        h = new Z.HuffmanTree(ll, nl, 257, Z.CPLENS, Z.CPLEXT, this.bl);
        if(this.bl == 0)        // no literals or lengths
            h.status = 1;
        if(h.status != 0) {
            if(h.status == 1)
                ;// **incomplete literal tree**
            return -1;                // incomplete code set
        }
        this.tl = h.root;
        this.bl = h.m;

        for(i = 0; i < nd; i++) ll[i] = ll[i + nl];
        this.bd = dbits;
        h = new Z.HuffmanTree(ll, nd, 0, Z.CPDIST, Z.CPDEXT, this.bd);
        this.td = h.root;
        this.bd = h.m;

        if(this.bd == 0 && nl > 257) {   // lengths but no distances
            // **incomplete distance tree**
            return -1;
        }
        if(h.status == 1) {
            ;// **incomplete distance tree**
        }
        if(h.status != 0) return -1;
        // decompress until an end-of-block code
        return this._decodeCodes(io, off, size);
    }
};
