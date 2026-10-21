"""Fixed CRC32 bridge. Framed stdio is lifecycle isolation, not a hostile-code sandbox."""
import sys, struct, json, ctypes, hashlib, pathlib, platform, base64
VERSION = 1
MAX_FRAME = 1400000
MAX_INPUT = 1048576

def exact(stream, count):
    parts = []
    while count:
        b = stream.read(count)
        if not b:
            raise EOFError('truncated frame')
        parts.append(b)
        count -= len(b)
    return b''.join(parts)

def send(value):
    body = json.dumps(value, ensure_ascii=True, separators=(',', ':')).encode('utf8')
    sys.stdout.buffer.write(struct.pack('>I', len(body)) + body)
    sys.stdout.buffer.flush()

def main():
    library, expected, package_digest, nonce = sys.argv[1:]
    p = pathlib.Path(library)
    if not p.is_absolute() or p.is_symlink() or not p.is_file() or p.stat().st_size > 8388608:
        raise ValueError('invalid library')
    if hashlib.sha256(p.read_bytes()).hexdigest() != expected:
        raise ValueError('library identity differs')
    if sys.platform != 'linux' or platform.machine() != 'x86_64' or ctypes.sizeof(ctypes.c_ulong) != 8 or ctypes.sizeof(ctypes.c_uint) != 4:
        raise ValueError('unsupported ABI')
    lib = ctypes.CDLL(str(p), mode=ctypes.RTLD_LOCAL)
    crc = lib.crc32
    crc.argtypes = [ctypes.c_ulong, ctypes.c_void_p, ctypes.c_uint]
    crc.restype = ctypes.c_ulong
    lib.zlibVersion.argtypes = []
    lib.zlibVersion.restype = ctypes.c_char_p
    send({'kind':'hello','version':VERSION,'nonce':nonce,'digest':package_digest,'librarySha256':expected,'zlibVersion':lib.zlibVersion().decode('ascii'),'abi':{'platform':sys.platform,'machine':platform.machine(),'ulongBytes':8,'uintBytes':4},'python':platform.python_version()})
    while True:
        head = sys.stdin.buffer.read(4)
        if not head:
            return
        if len(head) != 4:
            head += exact(sys.stdin.buffer, 4-len(head))
        size = struct.unpack('>I', head)[0]
        if not 1 <= size <= MAX_FRAME:
            raise ValueError('frame exceeds limit')
        request = json.loads(exact(sys.stdin.buffer, size).decode('utf8'))
        if not isinstance(request,dict) or set(request) != {'kind','version','id','operation','payload'} or request['kind'] != 'request' or type(request['version']) is not int or request['version'] != VERSION or not isinstance(request['id'],str) or not 1 <= len(request['id']) <= 64:
            raise ValueError('invalid protocol envelope')
        ident = request['id']
        try:
            value = request['payload']
            if request['operation'] != 'crc32' or not isinstance(value,dict) or set(value) != {'base64','seed'} or type(value['seed']) is not int or not 0 <= value['seed'] <= 0xffffffff or not isinstance(value['base64'],str):
                raise ValueError('unsupported checksum request')
            data = base64.b64decode(value['base64'], validate=True)
            if len(data) > MAX_INPUT or base64.b64encode(data).decode('ascii') != value['base64']:
                raise ValueError('noncanonical or oversized payload')
            result = value['seed']
            for offset in range(0, max(1,len(data)), 65536):
                chunk = data[offset:offset+65536]
                buffer = ctypes.create_string_buffer(chunk)
                result = int(crc(result,ctypes.cast(buffer,ctypes.c_void_p),len(chunk))) & 0xffffffff
            send({'kind':'result','version':VERSION,'id':ident,'value':result,'bytes':len(data)})
        except (ValueError,TypeError) as error:
            send({'kind':'error','version':VERSION,'id':ident,'code':'operation','message':str(error)[:200]})

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        sys.stderr.write(type(error).__name__ + ': ' + str(error)[:300] + '\n')
        sys.exit(2)
