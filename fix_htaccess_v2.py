import ftplib

def disable_rewrite():
    host = "somos-nara.com"
    user = "dieg2@somos-nara.com"
    password = "qakmi8-Qogwyh-makbaz"
    
    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    
    htaccess_content = "DirectoryIndex index.html\nRewriteEngine Off\n"
    
    with open("temp_htaccess", "w") as f:
        f.write(htaccess_content)
        
    with open("temp_htaccess", "rb") as f:
        ftp.storbinary("STOR .htaccess", f)
        
    print("✅ .htaccess actualizado con RewriteEngine Off")
    ftp.quit()

if __name__ == "__main__":
    disable_rewrite()
