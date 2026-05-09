import ftplib

def find_wp():
    host = "somos-nara.com"
    user = "admin@somos-nara.com" # Root access user
    password = "Dajtan-devwa8-miskig"
    
    ftp = ftplib.FTP(host)
    ftp.login(user, password)
    
    print("Files in root:")
    ftp.retrlines('LIST')
    
    try:
        ftp.cwd("somos-nara.com")
        print("\nFiles in /somos-nara.com/:")
        ftp.retrlines('LIST')
    except:
        print("\n❌ No /somos-nara.com/ folder found with this user.")
        
    ftp.quit()

if __name__ == "__main__":
    find_wp()
