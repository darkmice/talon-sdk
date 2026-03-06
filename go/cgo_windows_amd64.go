/*
 * Copyright (c) 2026 Talon Contributors
 * Author: dark.lijin@gmail.com
 * Licensed under the Talon Community Dual License Agreement.
 * See the LICENSE file in the project root for full license information.
 */
//go:build windows && amd64

package talon

/*
#cgo LDFLAGS: -L${SRCDIR}/../lib/windows_amd64 -ltalon
#cgo LDFLAGS: -lws2_32 -lbcrypt -luserenv -lntdll
*/
import "C"
