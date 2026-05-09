import ftplib
import os

def upload_directory(ftp, local_dir):
    for item in os.listdir(local_dir):
        local_path = os.path.join(local_dir, item)
        if os.path.isfile(local_path):
            with open(local_path, 'rb') as f:
                print(f"Subiendo {item}...")
                ftp.storbinary(f'STOR {item}', f)
        elif os.path.isdir(local_path):
            try:
                ftp.mkd(item)
            except:
                pass # Dir might exist
            ftp.cwd(item)
            upload_directory(ftp, local_path)
            ftp.cwd('..')

def deploy():
    host = "somos-nara.com"
    user = "diego@somos-nara.com"
    password = "koXzuf-jyzset-dizri2"
    
    local_dist = "/Users/diego/Downloads/PROYECTOS_DIEGO/01_NARA_Psychology/01_Plataformas_Web/nara-web-astro/dist"
    
    if not os.path.exists(local_dist):
        print(f"❌ Error: No se encontró la carpeta {local_dist}")
        return

    try:
        ftp = ftplib.FTP(host)
        ftp.login(user, password)
        print("✅ Conectado a la nueva cuenta (public_html). Iniciando subida...")
        
        # List to see if there's an existing index.php to remove (Neubox default)
        files = ftp.nlst()
        for f in ["index.php", "default.php", "cgi-bin"]:
            if f in files:
                print(f"Limpiando archivo viejo: {f}")
                try:
                    if f == "cgi-bin":
                        pass # Don't delete cgi-bin
                    else:
                        ftp.delete(f)
                except:
                    pass

        upload_directory(ftp, local_dist)
        
        print("🏁 DESPLIEGUE FINAL COMPLETADO CON ÉXITO!")
        ftp.quit()
    except Exception as e:
        print(f"❌ Error durante el despliegue: {e}")

if __name__ == "__main__":
    deploy()
