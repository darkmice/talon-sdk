/*
 * Copyright (c) 2026 Talon Contributors
 * Author: dark.lijin@gmail.com
 * Licensed under the Talon Community Dual License Agreement.
 * See the LICENSE file in the project root for full license information.
 */
//go:build linux && riscv64

package talon

/*
#cgo LDFLAGS: -L${SRCDIR}/../lib/linux_riscv64 -ltalon
#cgo LDFLAGS: -lpthread -ldl -lm
*/
import "C"
