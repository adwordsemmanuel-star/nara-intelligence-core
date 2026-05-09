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

def deploy_to_public_terapia():
    host = "somos-nara.com"
    user = "dieg2@somos-nara.com"
    password = "qakmi8-Qogwyh-makbaz"
    
    local_dist = "/Users/diego/Downloads/PROYECTOS_DIEGO/01_NARA_Psychology/01_Plataformas_Web/nara-web-astro/dist"
    
    try:
        ftp = ftplib.FTP(host)
        ftp.login(user, password)
        print("✅ Conectado a /public_html/terapia/. Iniciando subida...")
        
        upload_directory(ftp, local_dist)
        
        print("🏁 DESPLIEGUE EN PUBLIC_HTML/TERAPIA COMPLETADO!")
        ftp.quit()
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    deploy_to_public_terapia()
