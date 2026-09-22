using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

namespace KickMilkaTrivia
{
    class Program
    {
        static Process nodeProcess = null;

        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.Title = "Kick Milka Trivia Bot & OBS Overlay (Paimon Edition)";

            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine(@"
   ███╗   ███╗██╗██╗     ██╗  ██╗ █████╗     ████████╗██████╗ ██╗██╗   ██╗██╗ █████╗ 
   ████╗ ████║██║██║     ██║ ██╔╝██╔══██╗    ╚══██╔══╝██╔══██╗██║██║   ██║██║██╔══██╗
   ██╔████╔██║██║██║     █████═╝ ███████║       ██║   ██████╔╝██║██║   ██║██║███████║
   ██║╚██╔╝██║██║██║     ██╔═██╗ ██╔══██║       ██║   ██╔══██╗██║╚██╗ ██╔╝██║██╔══██║
   ██║ ╚═╝ ██║██║███████╗██║ ╚██╗██║  ██║       ██║   ██║  ██║██║ ╚████╔╝ ██║██║  ██║
   ╚═╝     ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝       ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚═╝╚═╝  ╚═╝
              MİLKA TRİVİA BOT & OBS OVERLAY - PAIMON EDITION
            ");
            Console.ResetColor();

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("===============================================================");
            Console.WriteLine("  Kick Milka Trivia Baslatiliyor (Paimon Sahnede!)...");
            Console.WriteLine("===============================================================");
            Console.ResetColor();

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(baseDir);

            // 1. Proje dosyalari kontrolu
            string serverJsPath = Path.Combine(baseDir, "src", "server.js");
            if (!File.Exists(serverJsPath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n[HATA] 'src/server.js' dosyasi bulunamadi!");
                Console.WriteLine("KickGenshinTrivia.exe dosyasini proje klasorunden ayirmadan calistirmalisiniz.");
                Console.WriteLine("Lutfen tum klasoru (src, public, bin, vb.) ayni yerde bulundurun.\n");
                Console.ResetColor();
                Console.WriteLine("Cikmak icin bir tusa basin...");
                Console.ReadKey();
                return;
            }

            // 2. Node.js calistirilabilir dosyasini bul (bin/node.exe, kurulu node veya PATH)
            string nodePath = FindNodeExecutable(baseDir);
            if (string.IsNullOrEmpty(nodePath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n==================================================================");
                Console.WriteLine("  [HATA] Bu bilgisayarda Node.js bulunamadi!");
                Console.WriteLine("==================================================================");
                Console.ResetColor();
                Console.WriteLine("  Botun calisabilmesi icin sistemde Node.js gereklidir.");
                Console.WriteLine("  1. https://nodejs.org adresine gidin.");
                Console.WriteLine("  2. 'LTS' (Recommended For Most Users) surumunu kurun.");
                Console.WriteLine("  3. Kurulum tamamlandiktan sonra bu programi tekrar acin.\n");

                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.Write("  Node.js indirme sayfasini tarayicida acmak ister misiniz? (E/H): ");
                Console.ResetColor();

                try
                {
                    string answer = Console.ReadLine();
                    if (string.IsNullOrEmpty(answer) || answer.Trim().ToUpper().StartsWith("E") || answer.Trim().ToUpper().StartsWith("Y"))
                    {
                        Process.Start(new ProcessStartInfo("https://nodejs.org/en/download") { UseShellExecute = true });
                    }
                }
                catch {}
                return;
            }

            // Clean up any old process holding port 3000
            EnsurePortFree(3000);

            // Register exit handler to terminate node process
            AppDomain.CurrentDomain.ProcessExit += OnProcessExit;
            Console.CancelKeyPress += OnCancelKeyPress;

            // Start Node process
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = "src/server.js",
                    WorkingDirectory = baseDir,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                nodeProcess = new Process { StartInfo = psi };
                nodeProcess.OutputDataReceived += (sender, e) =>
                {
                    if (e.Data != null)
                    {
                        if (e.Data.Contains("✅") || e.Data.Contains("başarıyla") || e.Data.Contains("basariyla"))
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine(e.Data);
                            Console.ResetColor();
                        }
                        else if (e.Data.Contains("Hata") || e.Data.Contains("Error"))
                        {
                            Console.ForegroundColor = ConsoleColor.Red;
                            Console.WriteLine(e.Data);
                            Console.ResetColor();
                        }
                        else
                        {
                            Console.WriteLine(e.Data);
                        }
                    }
                };
                nodeProcess.ErrorDataReceived += (sender, e) =>
                {
                    if (e.Data != null)
                    {
                        Console.ForegroundColor = ConsoleColor.Red;
                        Console.WriteLine(e.Data);
                        Console.ResetColor();
                    }
                };

                nodeProcess.Start();
                nodeProcess.BeginOutputReadLine();
                nodeProcess.BeginErrorReadLine();

                // Wait 1.5 seconds and open browser
                Thread.Sleep(1500);
                try
                {
                    Process.Start(new ProcessStartInfo("http://localhost:3000/admin.html")
                    {
                        UseShellExecute = true
                    });
                }
                catch
                {
                    // Fallback
                }

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("\n[OK] Yonetim Paneli tarayicida acildi: http://localhost:3000/admin.html");
                Console.WriteLine("[OK] OBS Browser Source Linki:         http://localhost:3000/obs.html");
                Console.WriteLine("\n[i] Botu durdurmak icin bu pencereyi kapatabilir veya Ctrl+C yapabilirsiniz.\n");
                Console.ResetColor();

                nodeProcess.WaitForExit();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n[HATA] Bot baslatilamadi: " + ex.Message);
                Console.WriteLine("Lutfen sisteminizde Node.js'in kurulu oldugundan emin olun.");
                Console.ResetColor();
                Console.WriteLine("\nCikmak icin bir tusa basin...");
                Console.ReadKey();
            }
            finally
            {
                KillNode();
            }
        }

        static string FindNodeExecutable(string baseDir)
        {
            // 1. Proje icindeki tasinabilir bin/node.exe veya node.exe
            string localBin = Path.Combine(baseDir, "bin", "node.exe");
            if (File.Exists(localBin)) return localBin;

            string localRoot = Path.Combine(baseDir, "node.exe");
            if (File.Exists(localRoot)) return localRoot;

            // 2. Standart Windows program files kurulumlari
            string progFiles = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
            if (File.Exists(progFiles)) return progFiles;

            string progFilesX86 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe");
            if (File.Exists(progFilesX86)) return progFilesX86;

            string localAppData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "node", "node.exe");
            if (File.Exists(localAppData)) return localAppData;

            // 3. Sistem PATH uzerinden 'where node'
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "where",
                    Arguments = "node",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                };
                using (Process p = Process.Start(psi))
                {
                    string output = p.StandardOutput.ReadLine();
                    p.WaitForExit(1000);
                    if (!string.IsNullOrEmpty(output) && File.Exists(output.Trim()))
                    {
                        return output.Trim();
                    }
                }
            }
            catch {}

            return null;
        }

        static void EnsurePortFree(int port)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "powershell",
                    Arguments = "-NoProfile -Command \"Get-NetTCPConnection -LocalPort " + port + " -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }\"",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(3000);
                }
            }
            catch {}
        }

        static void OnProcessExit(object sender, EventArgs e)
        {
            KillNode();
        }

        static void OnCancelKeyPress(object sender, ConsoleCancelEventArgs e)
        {
            KillNode();
        }

        static void KillNode()
        {
            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                try
                {
                    nodeProcess.Kill();
                }
                catch {}
            }
        }
    }
}
