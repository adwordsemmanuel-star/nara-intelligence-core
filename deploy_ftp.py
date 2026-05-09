import ftplib
import os

def upload_directory(ftp, local_dir, remote_dir):
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
            upload_directory(ftp, local_path, item)
            ftp.cwd('..')

def deploy():
    host = "somos-nara.com"
    user = "admin@somos-nara.com"
    password = "Dajtan-devwa8-miskig"
    
    local_dist = "/Users/diego/Downloads/PROYECTOS_DIEGO/01_NARA_Psychology/01_Plataformas_Web/nara-web-astro/dist"
    
    if not os.path.exists(local_dist):
        print(f"❌ Error: No se encontró la carpeta {local_dist}")
        return

    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    print("✅ Conectado. Iniciando subida...")
    
    upload_directory(ftp, local_dist, '/')
    
    print("🏁 Despliegue completado con éxito!")
    ftp.quit()

if __name__ == "__main__":
    deploy()
