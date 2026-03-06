/*
 * Copyright (c) 2026 Talon Contributors
 * Author: dark.lijin@gmail.com
 * Licensed under the Talon Community Dual License Agreement.
 * See the LICENSE file in the project root for full license information.
 */
// Talon .NET SDK — P/Invoke 原生绑定。

using System;
using System.IO;
using System.Runtime.InteropServices;

namespace TalonDb
{
    /// <summary>C ABI 原生函数绑定。</summary>
    internal static class NativeLib
    {
        private const string LibName = "talon";

        static NativeLib()
        {
            // 自动从 talon-sdk/lib/{platform}/ 加载内嵌库
            var bundled = FindBundledLib();
            if (bundled != null)
                NativeLibrary.Load(bundled);
        }

        private static string? FindBundledLib()
        {
            string rid;
            string libName;
            string platDir;
            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                var arch = RuntimeInformation.OSArchitecture == Architecture.Arm64 ? "arm64" : "x64";
                rid = $"osx-{arch}";
                platDir = $"darwin_{(arch == "arm64" ? "arm64" : "amd64")}";
                libName = "libtalon.dylib";
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                rid = "win-x64";
                platDir = "windows_amd64";
                libName = "talon.dll";
            }
            else
            {
                string arch;
                string ridArch;
                if (RuntimeInformation.OSArchitecture == Architecture.Arm64)
                { arch = "arm64"; ridArch = "arm64"; }
                else if (RuntimeInformation.OSArchitecture.ToString() == "LoongArch64")
                { arch = "loongarch64"; ridArch = "loongarch64"; }
                else if (RuntimeInformation.OSArchitecture.ToString() == "RiscV64")
                { arch = "riscv64"; ridArch = "riscv64"; }
                else
                { arch = "amd64"; ridArch = "x64"; }
                rid = $"linux-{ridArch}";
                platDir = $"linux_{arch}";
                libName = "libtalon.so";
            }

            // 1. 环境变量优先
            var envPath = Environment.GetEnvironmentVariable("TALON_LIB_PATH");
            if (!string.IsNullOrEmpty(envPath) && File.Exists(envPath))
                return envPath;

            var asmDir = Path.GetDirectoryName(typeof(NativeLib).Assembly.Location);
            if (asmDir != null)
            {
                // 2. NuGet runtimes/{rid}/native/ (dotnet pack 标准布局)
                var nugetPath = Path.Combine(asmDir, "runtimes", rid, "native", libName);
                if (File.Exists(nugetPath)) return nugetPath;

                // 3. SDK 开发布局: talon-sdk/lib/{platform}/
                var sdkRoot = Path.GetFullPath(Path.Combine(asmDir, "..", "..", ".."));
                var bundled = Path.Combine(sdkRoot, "lib", platDir, libName);
                if (File.Exists(bundled)) return bundled;
            }
            return null;
        }

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr talon_open(
            [MarshalAs(UnmanagedType.LPUTF8Str)] string path);

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern void talon_close(IntPtr handle);

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int talon_execute(
            IntPtr handle,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string cmdJson,
            out IntPtr outJson);

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern void talon_free_string(IntPtr ptr);

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int talon_persist(IntPtr handle);
    }
}
