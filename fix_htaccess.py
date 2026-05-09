import ftplib

def force_index_html():
    host = "somos-nara.com"
    user = "dieg2@somos-nara.com"
    password = "qakmi8-Qogwyh-makbaz"
    
    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    
    htaccess_content = "DirectoryIndex index.html index.php\n"
    
    with open("temp_htaccess", "w") as f:
        f.write(htaccess_content)
        
    with open("temp_htaccess", "rb") as f:
        ftp.storbinary("STOR .htaccess", f)
        
    print("✅ .htaccess subido para priorizar index.html")
    ftp.quit()

if __name__ == "__main__":
    force_index_html()
